using BioFSharp.ArcIR;

namespace OverARC.Api;

/// <summary>Terminates BioFSharp.ArcIR representations behind one narrow C# boundary.</summary>
public sealed class ArcIrInteropAdapter
{
    /// <summary>Validates canonical ArcIR bytes with the sibling F# codec and flattens F# errors into transport-safe text.</summary>
    public IReadOnlyList<string> Validate(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes, writable: false);
        var result = ArcIRJson.read(stream);

        return result.IsOk
            ? []
            : result.ErrorValue.Select(error => $"{error.Code}: {error.Message}").ToArray();
    }

    /// <summary>Validates both canonical decoding and graph invariants required before authoritative editing.</summary>
    public IReadOnlyList<string> ValidateForEditing(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes, writable: false);
        var result = ArcIRJson.read(stream);
        if (result.IsError)
            return result.ErrorValue.Select(error => $"{error.Code}: {error.Message}").ToArray();

        return Validation.validate(result.ResultValue)
            .Select(issue => $"ARCIR_VALIDATION: {issue}")
            .ToArray();
    }

    /// <summary>Applies the core selected-literal transformation and returns canonical bytes plus plain occurrence accounting.</summary>
    public ArcLiteralMappingApplication ApplyLiteralMapping(
        byte[] bytes,
        string selector,
        string literal,
        string targetTermId)
    {
        using var stream = new MemoryStream(bytes, writable: false);
        var decoded = ArcIRJson.read(stream);
        if (decoded.IsError)
            return ArcLiteralMappingApplication.Failed(
                decoded.ErrorValue.Select(error => $"{error.Code}: {error.Message}").ToArray());

        var parsed = ArcIRJson.parseLocation(new FragmentSelector(ArcIRJson.JsonPointerConformsTo, selector));
        if (parsed.IsError)
            return ArcLiteralMappingApplication.Failed(
                parsed.ErrorValue.Select(error => $"{error.Code}: {error.Message}").ToArray());

        var command = new LiteralTermMapping(parsed.ResultValue, literal, Iri.Create(targetTermId));
        var applied = LiteralMapping.apply(command, decoded.ResultValue);
        if (applied.IsError)
            return ArcLiteralMappingApplication.Failed(
                applied.ErrorValue.Select(error => error.ToString()).ToArray());

        var encoded = ArcIRJson.writeBytes(applied.ResultValue.Graph);
        if (encoded.IsError)
            return ArcLiteralMappingApplication.Failed(
                encoded.ErrorValue.Select(error => $"{error.Code}: {error.Message}").ToArray());

        var application = applied.ResultValue.Application;
        return new ArcLiteralMappingApplication(
            encoded.ResultValue,
            ArcIRJson.selector(application.Input).Value,
            ArcIRJson.selector(application.Output).Value,
            application.Status.ToString(),
            []);
    }

    /// <summary>Returns the canonical JSON selector for a term definition.</summary>
    public string TermSelector(string termId) =>
        Select(ArcJsonLocation.NewTerm(Iri.Create(termId)));

    /// <summary>Returns the canonical JSON selector for an ArcIR object.</summary>
    public string ObjectSelector(string objectId) =>
        Select(ArcJsonLocation.NewObject(Iri.Create(objectId)));

    /// <summary>Returns the canonical JSON selector for an object's type assertion.</summary>
    public string TypeSelector(string objectId, string assertionId) =>
        Select(ArcJsonLocation.NewTypeAssertion(Iri.Create(objectId), Iri.Create(assertionId)));

    /// <summary>Returns the canonical JSON selector for an object's property assertion.</summary>
    public string PropertySelector(string objectId, string assertionId) =>
        Select(ArcJsonLocation.NewProperty(Iri.Create(objectId), Iri.Create(assertionId)));

    /// <summary>Returns the canonical JSON selector for an object's property value.</summary>
    public string PropertyValueSelector(string objectId, string assertionId) =>
        Select(ArcJsonLocation.NewPropertyValue(Iri.Create(objectId), Iri.Create(assertionId)));

    /// <summary>Returns the canonical JSON selector for an object-level annotation.</summary>
    public string ObjectAnnotationSelector(string objectId, string annotationId) =>
        Select(ArcJsonLocation.NewObjectAnnotation(Iri.Create(objectId), Iri.Create(annotationId)));

    /// <summary>Returns the canonical JSON selector for an object-level annotation value.</summary>
    public string ObjectAnnotationValueSelector(string objectId, string annotationId) =>
        Select(ArcJsonLocation.NewObjectAnnotationValue(Iri.Create(objectId), Iri.Create(annotationId)));

    /// <summary>Returns the canonical JSON selector for an annotation on an object property.</summary>
    public string PropertyAnnotationSelector(string objectId, string assertionId, string annotationId) =>
        Select(ArcJsonLocation.NewPropertyAnnotation(Iri.Create(objectId), Iri.Create(assertionId), Iri.Create(annotationId)));

    /// <summary>Returns the canonical JSON selector for an object-property annotation value.</summary>
    public string PropertyAnnotationValueSelector(string objectId, string assertionId, string annotationId) =>
        Select(ArcJsonLocation.NewPropertyAnnotationValue(Iri.Create(objectId), Iri.Create(assertionId), Iri.Create(annotationId)));

    /// <summary>Returns the canonical JSON selector for an ArcIR relation.</summary>
    public string RelationSelector(string relationId) =>
        Select(ArcJsonLocation.NewRelation(Iri.Create(relationId)));

    /// <summary>Returns the canonical JSON selector for a relation property assertion.</summary>
    public string RelationPropertySelector(string relationId, string assertionId) =>
        Select(ArcJsonLocation.NewRelationProperty(Iri.Create(relationId), Iri.Create(assertionId)));

    /// <summary>Returns the canonical JSON selector for a relation property value.</summary>
    public string RelationPropertyValueSelector(string relationId, string assertionId) =>
        Select(ArcJsonLocation.NewRelationPropertyValue(Iri.Create(relationId), Iri.Create(assertionId)));

    /// <summary>Returns the canonical JSON selector for a relation-level annotation.</summary>
    public string RelationAnnotationSelector(string relationId, string annotationId) =>
        Select(ArcJsonLocation.NewRelationAnnotation(Iri.Create(relationId), Iri.Create(annotationId)));

    /// <summary>Returns the canonical JSON selector for a relation-level annotation value.</summary>
    public string RelationAnnotationValueSelector(string relationId, string annotationId) =>
        Select(ArcJsonLocation.NewRelationAnnotationValue(Iri.Create(relationId), Iri.Create(annotationId)));

    /// <summary>Returns the canonical JSON selector for an annotation on a relation property.</summary>
    public string RelationPropertyAnnotationSelector(string relationId, string assertionId, string annotationId) =>
        Select(ArcJsonLocation.NewRelationPropertyAnnotation(Iri.Create(relationId), Iri.Create(assertionId), Iri.Create(annotationId)));

    /// <summary>Returns the canonical JSON selector for a relation-property annotation value.</summary>
    public string RelationPropertyAnnotationValueSelector(string relationId, string assertionId, string annotationId) =>
        Select(ArcJsonLocation.NewRelationPropertyAnnotationValue(Iri.Create(relationId), Iri.Create(assertionId), Iri.Create(annotationId)));

    /// <summary>Converts the F# selector value object into the plain string used by HTTP DTOs.</summary>
    private static string Select(ArcJsonLocation location) => ArcIRJson.selector(location).Value;
}

/// <summary>Transport-neutral result of one BioFSharp selected-literal transformation.</summary>
public sealed record ArcLiteralMappingApplication(
    byte[]? Bytes,
    string? InputSelector,
    string? OutputSelector,
    string? Status,
    IReadOnlyList<string> Errors)
{
    /// <summary>Gets whether the core returned canonical transformed bytes.</summary>
    public bool IsSuccess => Bytes is not null;

    /// <summary>Creates an unsuccessful application without leaking the F# failure union.</summary>
    internal static ArcLiteralMappingApplication Failed(IReadOnlyList<string> errors) =>
        new(null, null, null, null, errors);
}
