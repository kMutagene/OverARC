using System.Text;
using Microsoft.FSharp.Core;
using ProcessCore;

namespace OverARC.Api;

/// <summary>Terminates ProcessCore representations and exposes native ARC metadata as ordinary C# values.</summary>
public sealed class ProcessCoreInteropAdapter
{
    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    /// <summary>Decodes and re-encodes native ARC YAML, returning codec failures as transport-safe text.</summary>
    public IReadOnlyList<string> Validate(byte[] bytes)
    {
        try
        {
            var arc = ARC.fromYamlString(StrictUtf8.GetString(bytes));
            _ = arc.toYamlString(2);
            return [];
        }
        catch (Exception error)
        {
            return [$"PROCESSCORE_YAML: {error.Message}"];
        }
    }

    /// <summary>Returns ProcessCore's canonical YAML bytes for a decoded native ARC document.</summary>
    public byte[] EncodeCanonical(byte[] bytes)
    {
        var arc = ARC.fromYamlString(StrictUtf8.GetString(bytes));
        return StrictUtf8.GetBytes(arc.toYamlString(2));
    }

    /// <summary>Projects root artifact declarations into plain C# values for workspace discovery.</summary>
    public NativeArcSummary Inspect(byte[] bytes)
    {
        var arc = ARC.fromYamlString(StrictUtf8.GetString(bytes));
        var artifacts = arc.AllDataFiles()
            .Select(ProjectArtifact)
            .GroupBy(artifact => (artifact.Path, artifact.Selector), StringTupleComparer.Ordinal)
            .Select(group => group.First())
            .ToArray();
        var processes = arc.AllProcesses()
            .Select(process => new NativeArcProcess(
                process.Name,
                process.AdditionalType?.Value,
                ProjectOptionalArtifact(process.InputData()),
                ProjectOptionalArtifact(process.OutputData()),
                process.ParameterValue.Select(ProjectAnnotation).ToArray(),
                process.ExecutesRecipe?.Value.Parameters
                    .Select(parameter => new NativeArcFormalParameter(parameter.Name, parameter.NameTAN?.Value))
                    .ToArray() ?? []))
            .ToArray();

        return new NativeArcSummary(arc.Identifier, arc.Title?.Value, artifacts, processes);
    }

    /// <summary>Appends complete and fragment-level curation provenance and returns canonical native ARC YAML.</summary>
    public ProcessCoreCurationResult BuildCurationArc(byte[] baseArcBytes, ProcessCoreCurationPlan plan)
    {
        try
        {
            var arc = ARC.fromYamlString(StrictUtf8.GetString(baseArcBytes));
            var formalParameter = new FormalParameter("curation transformation", Some("CTRO:0000000"), null);
            var recipe = new Recipe(
                Some("OverARC literal-to-term curation"),
                null,
                null,
                null,
                null,
                null,
                Some<IEnumerable<FormalParameter>>([formalParameter]),
                null,
                null);
            arc.AddRecipe(recipe);
            arc.DateModified = FSharpOption<string>.Some(plan.SaveUtc.ToUniversalTime().ToString("O"));

            arc.AddDataFile(ProjectRevision(plan.ArcIrSuccessor));
            if (plan.SssomSuccessor is not null) arc.AddDataFile(ProjectRevision(plan.SssomSuccessor));

            AddLane(arc, plan, formalParameter, recipe, "artifact succession", ProjectRevision(plan.ArcIrPredecessor), ProjectRevision(plan.ArcIrSuccessor));
            if (plan.SssomSuccessor is not null)
                AddLane(arc, plan, formalParameter, recipe, "artifact succession", ProjectRevision(plan.SssomPredecessor), ProjectRevision(plan.SssomSuccessor));

            foreach (var operation in plan.Operations)
            {
                var selectedInput = ProjectFragment(
                    plan.ArcIrPredecessor,
                    operation.InputSelector,
                    "https://www.rfc-editor.org/rfc/rfc6901",
                    "ArcIR selected literal",
                    [CreateAnnotation("literal", operation.Literal)]);
                var selectedOutput = ProjectFragment(
                    plan.ArcIrSuccessor,
                    operation.OutputSelector,
                    "https://www.rfc-editor.org/rfc/rfc6901",
                    "ArcIR semantic companion",
                    [
                        CreateAnnotation("target term", operation.TargetTermId),
                        CreateAnnotation("mapping predicate", operation.PredicateId)
                    ]);
                var mappingRevision = operation.MappingCreated && plan.SssomSuccessor is not null
                    ? plan.SssomSuccessor
                    : plan.SssomPredecessor;
                var mappingRecord = ProjectFragment(
                    mappingRevision,
                    $"#row={operation.MappingRecord.Index + 2}",
                    "https://www.rfc-editor.org/rfc/rfc7111",
                    "SSSOM mapping record",
                    [
                        CreateAnnotation("record id", operation.MappingRecord.RecordId ?? string.Empty),
                        CreateAnnotation("mapping predicate", operation.PredicateId),
                        CreateAnnotation("target term", operation.TargetTermId)
                    ]);

                if (operation.MappingCreated)
                    AddLane(arc, plan, formalParameter, recipe, "mapping creation", selectedInput, mappingRecord);
                AddLane(arc, plan, formalParameter, recipe, "mapping application", selectedInput, selectedOutput);
                AddLane(arc, plan, formalParameter, recipe, "mapping application", mappingRecord, selectedOutput);
            }

            var constructedBytes = StrictUtf8.GetBytes(arc.toYamlString(2));
            var roundTripped = ARC.fromYamlString(StrictUtf8.GetString(constructedBytes));
            var bytes = StrictUtf8.GetBytes(roundTripped.toYamlString(2));
            _ = ARC.fromYamlString(StrictUtf8.GetString(bytes));
            return new ProcessCoreCurationResult(bytes, Inspect(bytes), []);
        }
        catch (Exception error)
        {
            return new ProcessCoreCurationResult(null, null, [$"PROCESSCORE_CURATION: {error.Message}"]);
        }
    }

    /// <summary>Projects a ProcessCore data node without allowing its mutable representation to escape.</summary>
    private static NativeArcArtifact ProjectArtifact(Data data) =>
        new(
            data.Path,
            data.Selector?.Value,
            data.SelectorFormat?.Value,
            data.AdditionalType?.Value,
            data.EncodingFormat?.Value,
            data.AdditionalProperty
                .FirstOrDefault(annotation => annotation.Name == "sha256")
                ?.Value
                ?.Value,
            data.AdditionalProperty.Select(ProjectAnnotation).ToArray());

    /// <summary>Projects an optional ProcessCore data lane into an ordinary nullable value.</summary>
    private static NativeArcArtifact? ProjectOptionalArtifact(Microsoft.FSharp.Core.FSharpOption<Data>? data) =>
        data is null ? null : ProjectArtifact(data.Value);

    /// <summary>Projects one ProcessCore annotation into immutable ordinary C# values.</summary>
    private static NativeArcAnnotation ProjectAnnotation(Annotation annotation) =>
        new(annotation.Name, annotation.Value?.Value, annotation.NameTAN?.Value, annotation.ValueTAN?.Value);

    /// <summary>Creates a complete immutable Data declaration with its verified digest annotation.</summary>
    private static Data ProjectRevision(NativeArtifactRevision revision) =>
        new(
            revision.Path,
            null,
            null,
            Some(revision.EncodingFormat),
            Some(revision.ArtifactType),
            null,
            Some<IEnumerable<Annotation>>([CreateAnnotation("sha256", revision.Sha256)]));

    /// <summary>Creates an artifact-qualified selected fragment with digest binding and exact occurrence metadata.</summary>
    private static Data ProjectFragment(
        NativeArtifactRevision revision,
        string selector,
        string selectorFormat,
        string artifactType,
        IReadOnlyList<Annotation> annotations) =>
        new(
            revision.Path,
            Some(selector),
            Some(selectorFormat),
            Some(revision.EncodingFormat),
            Some(artifactType),
            null,
            Some<IEnumerable<Annotation>>([CreateAnnotation("sha256", revision.Sha256), .. annotations]));

    /// <summary>Adds one singular ProcessCore lane with shared curation parameter, curator, and save-time values.</summary>
    private static void AddLane(
        ARC arc,
        ProcessCoreCurationPlan plan,
        FormalParameter formalParameter,
        Recipe recipe,
        string processType,
        Data input,
        Data output)
    {
        var process = new ProcessCore.Process(
            plan.ProcessName,
            Some(recipe),
            Some(processType),
            null,
            null,
            Some<IEnumerable<Annotation>>(
            [
                CreateAnnotation(
                    "curation transformation",
                    "literal-to-term mapping application",
                    "CTRO:0000000",
                    "CTRO:0000007",
                    "ParameterValue",
                    formalParameter),
                CreateAnnotation("curator", plan.Curator),
                CreateAnnotation("save time", plan.SaveUtc.ToUniversalTime().ToString("O"))
            ]));
        process.SetInputData(input);
        process.SetOutputData(output);
        arc.AddProcess(process);
    }

    /// <summary>Creates one ProcessCore annotation while containing F# option construction in the adapter.</summary>
    private static Annotation CreateAnnotation(
        string name,
        string? value = null,
        string? nameTan = null,
        string? valueTan = null,
        string? additionalType = null,
        FormalParameter? instanceOf = null) =>
        new(
            name,
            value is null ? null : Some(value),
            null,
            nameTan is null ? null : Some(nameTan),
            valueTan is null ? null : Some(valueTan),
            null,
            additionalType is null ? null : Some(additionalType),
            instanceOf is null ? null : Some(instanceOf));

    /// <summary>Constructs an F# option solely inside the ProcessCore interop boundary.</summary>
    private static FSharpOption<T> Some<T>(T value) where T : notnull => FSharpOption<T>.Some(value);

    /// <summary>Compares path/selector tuples ordinally during ProcessCore registry projection.</summary>
    private sealed class StringTupleComparer : IEqualityComparer<(string Path, string? Selector)>
    {
        internal static readonly StringTupleComparer Ordinal = new();

        public bool Equals((string Path, string? Selector) x, (string Path, string? Selector) y) =>
            string.Equals(x.Path, y.Path, StringComparison.Ordinal)
            && string.Equals(x.Selector, y.Selector, StringComparison.Ordinal);

        public int GetHashCode((string Path, string? Selector) value) =>
            HashCode.Combine(
                StringComparer.Ordinal.GetHashCode(value.Path),
                value.Selector is null ? 0 : StringComparer.Ordinal.GetHashCode(value.Selector));
    }
}

/// <summary>Transport-neutral snapshot of the native ARC root artifact declarations.</summary>
public sealed record NativeArcSummary(
    string Identifier,
    string? Title,
    IReadOnlyList<NativeArcArtifact> Artifacts,
    IReadOnlyList<NativeArcProcess> Processes);

/// <summary>Transport-neutral native ARC artifact identity used outside the ProcessCore adapter.</summary>
public sealed record NativeArcArtifact(
    string Path,
    string? Selector,
    string? SelectorFormat,
    string? ArtifactType,
    string? EncodingFormat,
    string? Sha256,
    IReadOnlyList<NativeArcAnnotation> Annotations);

/// <summary>Transport-neutral singular native process lane used to resolve artifact lineage.</summary>
public sealed record NativeArcProcess(
    string Name,
    string? ProcessType,
    NativeArcArtifact? Input,
    NativeArcArtifact? Output,
    IReadOnlyList<NativeArcAnnotation> Parameters,
    IReadOnlyList<NativeArcFormalParameter> FormalParameters);

/// <summary>Transport-neutral annotation retained on native artifacts and process parameter values.</summary>
public sealed record NativeArcAnnotation(string Name, string? Value, string? NameTan, string? ValueTan);

/// <summary>Transport-neutral formal parameter definition retained from a native curation recipe.</summary>
public sealed record NativeArcFormalParameter(string Name, string? NameTan);

/// <summary>Complete immutable artifact revision supplied to native provenance construction.</summary>
public sealed record NativeArtifactRevision(string Path, string Sha256, string ArtifactType, string EncodingFormat);

/// <summary>One selected-literal operation projected into exact ArcIR and SSSOM native fragments.</summary>
public sealed record NativeCurationOperation(
    string InputSelector,
    string OutputSelector,
    string Literal,
    string TargetTermId,
    string PredicateId,
    bool MappingCreated,
    SssomMappingRecord MappingRecord);

/// <summary>All ordinary values required to append one named curation event to native ARC provenance.</summary>
public sealed record ProcessCoreCurationPlan(
    string ProcessName,
    string Curator,
    DateTimeOffset SaveUtc,
    NativeArtifactRevision ArcIrPredecessor,
    NativeArtifactRevision ArcIrSuccessor,
    NativeArtifactRevision SssomPredecessor,
    NativeArtifactRevision? SssomSuccessor,
    IReadOnlyList<NativeCurationOperation> Operations);

/// <summary>Canonical native ARC result or transport-safe provenance construction errors.</summary>
public sealed record ProcessCoreCurationResult(byte[]? Bytes, NativeArcSummary? Summary, IReadOnlyList<string> Errors)
{
    /// <summary>Gets whether canonical native ARC bytes and inspection metadata were produced.</summary>
    public bool IsSuccess => Bytes is not null && Summary is not null;
}
