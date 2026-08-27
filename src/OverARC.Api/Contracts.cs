namespace OverARC.Api;

public sealed record WorkspaceDto(
    string Name,
    string RelativeManifestPath,
    string? DefaultStateId,
    IReadOnlyList<StateSummaryDto> States);

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

public sealed record TermDto(string Id, string Label, string? Name, string? Source, string Selector);

public sealed record NodeDto(
    string Id,
    string Label,
    string? Kind,
    IReadOnlyList<string> TypeIds,
    string SearchText,
    bool IsPlaceholder,
    string? Selector);

public sealed record RelationDto(
    string Id,
    string Label,
    string Subject,
    string PredicateId,
    string Object,
    string SearchText,
    bool IsDerived,
    string? Selector);

public sealed record GraphProjectionDto(
    string StateId,
    string Sha256,
    IReadOnlyList<TermDto> Terms,
    IReadOnlyList<NodeDto> Nodes,
    IReadOnlyList<RelationDto> Relations);

public sealed record DetailRequest(string Kind, string Id);

public sealed record TypeAssertionDto(string Id, string TermId, string TermLabel, string Selector);

public sealed record ArcValueDto(
    string Type,
    string Display,
    string? Text,
    bool? Boolean,
    IReadOnlyList<ArcValueDto>? Items);

public sealed record AnnotationValueDto(
    string Type,
    string Display,
    ArcValueDto? Literal,
    string? TermId,
    string? UnitId);

public sealed record AnnotationDto(
    string Id,
    string PropertyId,
    string PropertyLabel,
    AnnotationValueDto Value,
    string? Evidence,
    string? Source,
    string Selector,
    string ValueSelector);

public sealed record PropertyDto(
    string Id,
    string PredicateId,
    string PredicateLabel,
    ArcValueDto Value,
    IReadOnlyList<AnnotationDto> Annotations,
    string Selector,
    string ValueSelector);

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
