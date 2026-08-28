using System.ComponentModel;
using System.Globalization;

namespace OverARC.Api;

/// <summary>Describes the configured viewer workspace and all independently validated immutable states.</summary>
public sealed record WorkspaceDto(
    string Name,
    string RelativeManifestPath,
    string? DefaultStateId,
    IReadOnlyList<StateSummaryDto> States,
    string? LineageKind = null,
    IReadOnlyList<string>? Findings = null);

/// <summary>Reports manifest metadata, validation status, counts, and errors for one state entry.</summary>
public sealed record StateSummaryDto(
    string Id,
    string Label,
    string RelativePath,
    string Sha256,
    string Status,
    DateTimeOffset? LastWriteUtc,
    string? FormatVersion,
    int? ObjectCount,
    int? RelationCount,
    IReadOnlyList<string> Errors,
    bool? Editable = null,
    MappingArtifactSummaryDto? MappingArtifact = null,
    IReadOnlyList<string>? CurationErrors = null);

/// <summary>Reports the native SSSOM artifact paired with an editable ArcIR state.</summary>
public sealed record MappingArtifactSummaryDto(
    string RelativePath,
    string? Sha256,
    string Status,
    string? SssomVersion,
    string? MappingSetId,
    int? MappingCount,
    IReadOnlyList<string> Errors);

/// <summary>Provides term metadata and bounded usage summaries without adding term nodes or occurrence lists.</summary>
public sealed record TermDto(
    string Id,
    string Label,
    string? Name,
    string? Source,
    string Selector,
    int UsageCount,
    IReadOnlyList<string> UsageRoles);

/// <summary>Represents an ArcIR object or a projection-only placeholder in the compact graph response.</summary>
public sealed record NodeDto(
    string Id,
    string Label,
    string? Kind,
    IReadOnlyList<string> TypeIds,
    string SearchText,
    bool IsPlaceholder,
    string? Selector);

/// <summary>Represents an ArcRelation or a view-only ArcValue.Ref edge in the compact graph response.</summary>
public sealed record RelationDto(
    string Id,
    string Label,
    string Subject,
    string PredicateId,
    string Object,
    string SearchText,
    bool IsDerived,
    string? Selector);

/// <summary>Contains the complete client-side graph projection for one immutable ArcIR state.</summary>
public sealed record GraphProjectionDto(
    string StateId,
    string Sha256,
    IReadOnlyList<TermDto> Terms,
    IReadOnlyList<NodeDto> Nodes,
    IReadOnlyList<RelationDto> Relations);

/// <summary>Selects an object or relation by its exact IRI for the details endpoint.</summary>
public sealed record DetailRequest(string Kind, string Id);

/// <summary>Selects one exact term IRI for on-demand definition and occurrence details.</summary>
public sealed record TermDetailRequest(string Id);

/// <summary>Identifies one term occurrence by role, owner, addressable assertion, and canonical selector.</summary>
public sealed record TermUsageDto(
    string Role,
    string OwnerKind,
    string OwnerId,
    string OwnerLabel,
    string OccurrenceId,
    string Selector);

/// <summary>Contains one term definition and every exact usage occurrence in the active immutable state.</summary>
public sealed record TermDetailDto(
    string Id,
    string Label,
    string? Name,
    string? Source,
    string Selector,
    int UsageCount,
    IReadOnlyList<string> UsageRoles,
    IReadOnlyList<TermUsageDto> Usages);

/// <summary>Describes one object type assertion with its exact IDs and canonical selector.</summary>
public sealed record TypeAssertionDto(string Id, string TermId, string TermLabel, string Selector);

/// <summary>Transports an ArcValue without coercing exact numeric text through JavaScript numbers.</summary>
public sealed record ArcValueDto(
    string Type,
    string Display,
    string? Text,
    bool? Boolean,
    IReadOnlyList<ArcValueDto>? Items);

/// <summary>Transports literal, term, and unit-bearing annotation values in a uniform shape.</summary>
public sealed record AnnotationValueDto(
    string Type,
    string Display,
    ArcValueDto? Literal,
    string? TermId,
    string? UnitId);

/// <summary>Describes one complete annotation, including evidence, source, and exact selectors.</summary>
public sealed record AnnotationDto(
    string Id,
    string PropertyId,
    string PropertyLabel,
    AnnotationValueDto Value,
    string? Evidence,
    string? Source,
    string Selector,
    string ValueSelector);

/// <summary>Describes one object or relation property assertion and all nested annotations.</summary>
public sealed record PropertyDto(
    string Id,
    string PredicateId,
    string PredicateLabel,
    ArcValueDto Value,
    IReadOnlyList<AnnotationDto> Annotations,
    string Selector,
    string ValueSelector);

/// <summary>Contains the complete inspector payload for one exact ArcIR object or relation.</summary>
public sealed record ElementDetailDto(
    string Kind,
    string Id,
    string Label,
    string Selector,
    string? ObjectKind,
    string? Subject,
    string? PredicateId,
    string? PredicateLabel,
    string? Object,
    IReadOnlyList<TypeAssertionDto> Types,
    IReadOnlyList<PropertyDto> Properties,
    IReadOnlyList<AnnotationDto> Annotations);

/// <summary>Starts a server-owned draft with the curator identity recorded in native save provenance.</summary>
public sealed record CreateDraftRequest(
    [property: Description("Non-empty curator identity recorded in every native process lane.")]
    string Curator);

/// <summary>Supplies the optimistic revision precondition for discard, undo, and save mutations.</summary>
public sealed record DraftRevisionRequest(
    [property: Description("Non-negative decimal revision represented as a string to remain JavaScript-lossless.")]
    string ExpectedRevision);

/// <summary>Requests one selected-literal mapping while preserving exact selectors and identifiers.</summary>
public sealed record AddLiteralMappingDto(
    [property: Description("Non-negative decimal revision represented as a string to remain JavaScript-lossless.")]
    string ExpectedRevision,
    string Selector,
    string Literal,
    string TargetTermId,
    string PredicateId);

/// <summary>One ordered draft operation projected into transport-safe ArcIR and SSSOM accounting.</summary>
public sealed record CurationOperationDto(
    string Id,
    string Selector,
    string Literal,
    string TargetTermId,
    string TargetTermLabel,
    string PredicateId,
    string ProposedRecordId,
    string OutputSelector,
    string ArcIrStatus,
    bool MappingCreated,
    SssomMappingRecord MappingRecord);

/// <summary>HTTP representation of a server-owned draft with its 64-bit revision encoded as text.</summary>
public sealed record CurationDraftDto(
    string Id,
    string StateId,
    string Revision,
    string ProcessName,
    string Curator,
    DateTimeOffset CreatedUtc,
    DateTimeOffset LastAccessUtc,
    string BaseArcIrSha256,
    string BaseSssomSha256,
    string ArcIrSha256,
    string SssomSha256,
    IReadOnlyList<CurationOperationDto> Operations);

/// <summary>Metadata and populated mapping fields for an immutable state or replayed draft SSSOM artifact.</summary>
public sealed record MappingsDto(
    string StateId,
    string? DraftId,
    string? RelativePath,
    string Sha256,
    bool IsDraft,
    string? SssomVersion,
    string MappingSetId,
    string License,
    IReadOnlyList<SssomField> MetadataFields,
    IReadOnlyList<SssomMappingView> Mappings);

/// <summary>HTTP result for a committed curation successor selection and immutable artifact identities.</summary>
public sealed record CurationSaveDto(
    string DraftId,
    string ProcessName,
    DateTimeOffset SaveUtc,
    string SuccessorStateId,
    string ArcIrPath,
    string ArcIrSha256,
    string MappingPath,
    string MappingSha256,
    bool MappingCreated,
    string ArcYamlSha256);

/// <summary>Maps application draft and save models to lossless hand-written HTTP contracts.</summary>
public static class CurationContractMapper
{
    /// <summary>Projects a draft snapshot while encoding its monotonically increasing revision as decimal text.</summary>
    public static CurationDraftDto Draft(CurationDraftSnapshot snapshot) =>
        new(
            snapshot.Id,
            snapshot.StateId,
            snapshot.Revision.ToString(CultureInfo.InvariantCulture),
            snapshot.ProcessName,
            snapshot.Curator,
            snapshot.CreatedUtc,
            snapshot.LastAccessUtc,
            snapshot.BaseArcIrSha256,
            snapshot.BaseSssomSha256,
            snapshot.ArcIrSha256,
            snapshot.SssomSha256,
            snapshot.Commands.Select(Operation).ToArray());

    /// <summary>Projects one replayed typed command without changing its exact selectors or identifiers.</summary>
    public static CurationOperationDto Operation(DraftCommandSummary command) =>
        new(
            command.Id,
            command.Selector,
            command.Literal,
            command.TargetTermId,
            command.TargetTermLabel,
            command.PredicateId,
            command.ProposedRecordId,
            command.OutputSelector,
            command.ArcIrStatus,
            command.MappingCreated,
            command.MappingRecord);

    /// <summary>Projects a committed save result into its explicit HTTP response contract.</summary>
    public static CurationSaveDto Save(CurationSaveResult result) =>
        new(
            result.DraftId,
            result.ProcessName,
            result.SaveUtc,
            result.SuccessorStateId,
            result.ArcIrPath,
            result.ArcIrSha256,
            result.MappingPath,
            result.MappingSha256,
            result.MappingCreated,
            result.ArcYamlSha256);

    /// <summary>Parses a transport revision after enforcing the non-negative decimal contract.</summary>
    public static long Revision(string value)
    {
        if (long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var revision)) return revision;
        throw new DraftValidationException(["Expected revision must be a non-negative decimal 64-bit integer string."]);
    }
}
