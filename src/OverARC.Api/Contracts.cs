namespace OverARC.Api;

/// <summary>Describes the configured viewer workspace and all independently validated immutable states.</summary>
public sealed record WorkspaceDto(
    string Name,
    string RelativeManifestPath,
    string? DefaultStateId,
    IReadOnlyList<StateSummaryDto> States);

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
