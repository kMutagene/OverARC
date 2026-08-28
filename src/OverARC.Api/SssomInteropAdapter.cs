using System.Text;
using System.Security.Cryptography;
using System.Collections;
using System.Globalization;
using System.Reflection;
using Microsoft.FSharp.Core;
using SSSOM;

namespace OverARC.Api;

/// <summary>Terminates PolyglotSSSOM representations and exposes only transport-neutral validation and canonical bytes.</summary>
public sealed class SssomInteropAdapter
{
    private const string ManualCuration = "semapv:ManualMappingCuration";
    private const string OverArcCreator = "https://github.com/kMutagene/OverARC";
    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    /// <summary>Decodes and validates an embedded SSSOM document, flattening library diagnostics into plain text.</summary>
    public IReadOnlyList<string> Validate(byte[] bytes)
    {
        try
        {
            var result = SssomCodec.TryDecodeEmbedded(StrictUtf8.GetString(bytes));
            return result.Diagnostics
                .Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error)
                .Select(FormatDiagnostic)
                .ToArray();
        }
        catch (Exception error) when (error is DecoderFallbackException or ArgumentException)
        {
            return [$"SSSOM_ENCODING: {error.Message}"];
        }
    }

    /// <summary>Decodes, validates, and returns the canonical embedded SSSOM representation.</summary>
    public byte[] EncodeCanonical(byte[] bytes)
    {
        var document = SssomCodec.DecodeEmbedded(StrictUtf8.GetString(bytes));
        return StrictUtf8.GetBytes(SssomCodec.EncodeCanonical(document));
    }

    /// <summary>Returns ordinary metadata needed to identify a mapping artifact without exposing the F# document model.</summary>
    public SssomDocumentSummary Inspect(byte[] bytes)
    {
        var document = SssomCodec.DecodeEmbedded(StrictUtf8.GetString(bytes));
        return new SssomDocumentSummary(
            document.Metadata.SssomVersion?.Value.ToString() switch
            {
                "V1_0" => "1.0",
                "V1_1" => "1.1",
                _ => null
            },
            document.Metadata.MappingSetId.Value,
            document.Metadata.License.Value,
            document.Mappings.Length);
    }

    /// <summary>Projects all populated standard and declared extension fields for mapping-set HTTP views.</summary>
    public SssomDocumentView InspectDocument(byte[] bytes)
    {
        var document = SssomCodec.DecodeEmbedded(StrictUtf8.GetString(bytes));
        var summary = new SssomDocumentSummary(
            document.Metadata.SssomVersion?.Value.ToString() switch
            {
                "V1_0" => "1.0",
                "V1_1" => "1.1",
                _ => null
            },
            document.Metadata.MappingSetId.Value,
            document.Metadata.License.Value,
            document.Mappings.Length);
        return new SssomDocumentView(
            summary,
            ProjectFields(document.Metadata, document.Metadata),
            document.Mappings
                .Select((mapping, index) => new SssomMappingView(index, ProjectFields(mapping, document.Metadata)))
                .ToArray());
    }

    /// <summary>Creates or reuses one exact literal mapping while retaining imported fields and extensions.</summary>
    public SssomLiteralMappingApplication ApplyLiteralMapping(
        byte[] bytes,
        string literal,
        string targetTermId,
        string targetTermLabel,
        string predicateId,
        string recordId,
        DateOnly? mappingDate = null)
    {
        SssomDocument document;
        try
        {
            document = SssomCodec.DecodeEmbedded(StrictUtf8.GetString(bytes));
        }
        catch (Exception error)
        {
            return SssomLiteralMappingApplication.Failed([$"SSSOM_DECODE: {error.Message}"]);
        }

        var existing = document.Mappings
            .Select((mapping, index) => (Mapping: mapping, Index: index))
            .FirstOrDefault(candidate => ExactLiteralMapping(document.Metadata, candidate.Mapping, literal, targetTermId, predicateId));
        if (existing.Mapping is not null)
            return new SssomLiteralMappingApplication(
                bytes,
                ProjectRecord(document.Metadata, existing.Mapping, existing.Index),
                false,
                []);

        try
        {
            var mapping = Mapping.CreateEntityMapping(targetTermId, predicateId, targetTermId, ManualCuration);
            mapping.SubjectId = null!;
            mapping.SubjectLabel = FSharpOption<string>.Some(literal);
            mapping.SubjectType = FSharpOption<EntityType>.Some(EntityType.RdfsLiteral);
            mapping.ObjectLabel = FSharpOption<string>.Some(targetTermLabel);
            mapping.CreatorId = [EntityReference.Create(OverArcCreator)];
            mapping.CreatorLabel = ["OverARC"];
            if (mappingDate is not null)
                mapping.MappingDate = FSharpOption<SssomDate>.Some(SssomDate.Create(mappingDate.Value.ToString("yyyy-MM-dd")));
            EnsureEntityPrefix(document.Metadata, "uuid", recordId);
            EnsureEntityPrefix(document.Metadata, "overarc_creator", OverArcCreator);
            EnsureEntityPrefix(document.Metadata, "target", targetTermId);
            document.AddMappingWithRecordId(recordId, mapping);

            var encoded = StrictUtf8.GetBytes(SssomCodec.EncodeCanonical(document));
            return new SssomLiteralMappingApplication(
                encoded,
                ProjectRecord(document.Metadata, mapping, document.Mappings.Length - 1),
                true,
                []);
        }
        catch (SssomCodecException error)
        {
            return SssomLiteralMappingApplication.Failed(
                error.Diagnostics.Select(FormatDiagnostic).ToArray());
        }
        catch (Exception error)
        {
            return SssomLiteralMappingApplication.Failed([$"SSSOM_EDIT: {error.Message}"]);
        }
    }

    /// <summary>Tests the exact literal/predicate/target identity used by the curation reuse rule.</summary>
    private static bool ExactLiteralMapping(
        MappingSet metadata,
        Mapping mapping,
        string literal,
        string targetTermId,
        string predicateId) =>
        mapping.SubjectId is null
        && mapping.SubjectLabel?.Value == literal
        && mapping.SubjectType?.Value.ToString() == "RdfsLiteral"
        && mapping.ObjectId is not null
        && CurieMap.expand(metadata.CurieMap, mapping.ObjectId.Value.Value) == targetTermId
        && mapping.PredicateId.Value == predicateId;

    /// <summary>Projects one mapping row into immutable plain C# provenance and display fields.</summary>
    private static SssomMappingRecord ProjectRecord(MappingSet metadata, Mapping mapping, int index) =>
        new(
            index,
            mapping.RecordId is null ? null : CurieMap.expand(metadata.CurieMap, mapping.RecordId.Value.Value),
            mapping.SubjectLabel?.Value,
            mapping.PredicateId.Value,
            mapping.ObjectId is null ? null : CurieMap.expand(metadata.CurieMap, mapping.ObjectId.Value.Value),
            mapping.ObjectLabel?.Value,
            mapping.MappingJustification.Value);

    /// <summary>Flattens populated model properties and extension values into lexical ordinary fields.</summary>
    private static IReadOnlyList<SssomField> ProjectFields(object source, MappingSet metadata)
    {
        var fields = source.GetType()
            .GetProperties(BindingFlags.Instance | BindingFlags.Public)
            .Where(property => property.CanRead && property.GetIndexParameters().Length == 0)
            .Where(property => property.Name is not "ExtensionValues" and not "ExtensionDefinitions" and not "CurieMap")
            .Select(property => new SssomField(
                ToSnakeCase(property.Name),
                ProjectValues(property.GetValue(source), property.PropertyType, metadata)))
            .Where(field => field.Values.Count > 0)
            .ToList();

        if (source is MappingSet mappingSet)
        {
            if (mappingSet.CurieMap.Length > 0)
                fields.Add(new SssomField(
                    "curie_map",
                    mappingSet.CurieMap.Select(entry => $"{entry.PrefixName}: {entry.PrefixUrl.Value}").ToArray()));
            if (mappingSet.ExtensionDefinitions.Length > 0)
                fields.Add(new SssomField(
                    "extension_definitions",
                    mappingSet.ExtensionDefinitions.Select(ProjectExtensionDefinition).ToArray()));
            AddExtensionValues(fields, mappingSet.ExtensionValues);
        }
        else if (source is Mapping mapping)
        {
            AddExtensionValues(fields, mapping.ExtensionValues);
        }

        return fields.OrderBy(field => field.Name, StringComparer.Ordinal).ToArray();
    }

    /// <summary>Projects an option, array, or scalar property without allowing its runtime representation to escape.</summary>
    private static IReadOnlyList<string> ProjectValues(object? value, Type declaredType, MappingSet metadata)
    {
        if (value is null) return [];
        if (declaredType.IsGenericType && declaredType.GetGenericTypeDefinition() == typeof(FSharpOption<>))
        {
            var optionValue = declaredType.GetProperty("Value")!.GetValue(value);
            return optionValue is null ? [] : [ProjectLexical(optionValue, metadata)];
        }

        if (value is IEnumerable sequence and not string)
            return sequence.Cast<object?>().Where(item => item is not null).Select(item => ProjectLexical(item!, metadata)).ToArray();
        return [ProjectLexical(value, metadata)];
    }

    /// <summary>Converts one supported SSSOM scalar to its lossless display lexical form.</summary>
    private static string ProjectLexical(object value, MappingSet metadata) => value switch
    {
        string text => text,
        EntityReference entity => CurieMap.expand(metadata.CurieMap, entity.Value),
        UriReference uri => uri.Value,
        SssomDate date => date.Value,
        double number => number.ToString("R", CultureInfo.InvariantCulture),
        float number => number.ToString("R", CultureInfo.InvariantCulture),
        IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? string.Empty
    };

    /// <summary>Adds retained extension values as their declared slot names and uninterpreted lexical content.</summary>
    private static void AddExtensionValues(ICollection<SssomField> fields, IEnumerable<ExtensionValue> extensions)
    {
        foreach (var extension in extensions)
            fields.Add(new SssomField(extension.SlotName, [extension.Value]));
    }

    /// <summary>Projects one extension definition without importing its F# options into the application model.</summary>
    private static string ProjectExtensionDefinition(ExtensionDefinition definition)
    {
        var property = definition.Property is null ? string.Empty : $"; property={definition.Property.Value.Value}";
        var typeHint = definition.TypeHint is null ? string.Empty : $"; type={definition.TypeHint.Value.Value}";
        return $"{definition.SlotName}{property}{typeHint}";
    }

    /// <summary>Converts PascalCase core property names into stable SSSOM slot names.</summary>
    private static string ToSnakeCase(string value)
    {
        var result = new StringBuilder(value.Length + 8);
        for (var index = 0; index < value.Length; index++)
        {
            if (index > 0 && char.IsUpper(value[index])) result.Append('_');
            result.Append(char.ToLowerInvariant(value[index]));
        }

        return result.ToString();
    }

    /// <summary>Adds a deterministic collision-resistant CURIE prefix required for canonical entity encoding.</summary>
    private static void EnsureEntityPrefix(MappingSet metadata, string hint, string value)
    {
        var cut = Math.Max(value.LastIndexOf('#'), Math.Max(value.LastIndexOf('/'), value.LastIndexOf(':')));
        if (cut < 0 || cut == value.Length - 1) return;
        var prefixUrl = value[..(cut + 1)];
        var digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(prefixUrl))).ToLowerInvariant()[..8];
        metadata.EnsurePrefix($"{hint}_{digest}", prefixUrl);
    }

    /// <summary>Flattens a PolyglotSSSOM diagnostic while retaining its stable code and source line.</summary>
    private static string FormatDiagnostic(SssomDiagnostic diagnostic)
    {
        var location = diagnostic.Line is null ? string.Empty : $" at line {diagnostic.Line.Value}";
        return $"{diagnostic.Code}{location}: {diagnostic.Message}";
    }
}

/// <summary>Transport-neutral identity and row count for a decoded SSSOM mapping set.</summary>
public sealed record SssomDocumentSummary(string? SssomVersion, string MappingSetId, string License, int MappingCount);

/// <summary>One populated standard or extension SSSOM slot represented only by lexical values.</summary>
public sealed record SssomField(string Name, IReadOnlyList<string> Values);

/// <summary>All populated fields for one zero-based SSSOM mapping row.</summary>
public sealed record SssomMappingView(int Index, IReadOnlyList<SssomField> Fields);

/// <summary>Transport-neutral mapping-set metadata and records projected from one validated SSSOM document.</summary>
public sealed record SssomDocumentView(
    SssomDocumentSummary Summary,
    IReadOnlyList<SssomField> MetadataFields,
    IReadOnlyList<SssomMappingView> Mappings);

/// <summary>Plain identity and curator-facing fields for one exact SSSOM row.</summary>
public sealed record SssomMappingRecord(
    int Index,
    string? RecordId,
    string? SubjectLabel,
    string PredicateId,
    string? ObjectId,
    string? ObjectLabel,
    string MappingJustification);

/// <summary>Transport-neutral result of one PolyglotSSSOM literal mapping edit or reuse.</summary>
public sealed record SssomLiteralMappingApplication(
    byte[]? Bytes,
    SssomMappingRecord? Record,
    bool Created,
    IReadOnlyList<string> Errors)
{
    /// <summary>Gets whether validation produced a usable mapping document and exact row.</summary>
    public bool IsSuccess => Bytes is not null && Record is not null;

    /// <summary>Creates an unsuccessful application without exposing PolyglotSSSOM types.</summary>
    internal static SssomLiteralMappingApplication Failed(IReadOnlyList<string> errors) => new(null, null, false, errors);
}
