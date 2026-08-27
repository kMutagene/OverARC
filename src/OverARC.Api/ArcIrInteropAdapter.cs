using BioFSharp.ArcIR;

namespace OverARC.Api;

/// <summary>Keeps all C#/F# representation interop behind one narrow boundary.</summary>
public sealed class ArcIrInteropAdapter
{
    public IReadOnlyList<string> Validate(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes, writable: false);
        var result = ArcIRJson.read(stream);

        return result.IsOk
            ? []
            : result.ErrorValue.Select(error => $"{error.Code}: {error.Message}").ToArray();
    }

    public string TermSelector(string termId) =>
        Select(ArcJsonLocation.NewTerm(Iri.Create(termId)));

    public string ObjectSelector(string objectId) =>
        Select(ArcJsonLocation.NewObject(Iri.Create(objectId)));

    public string TypeSelector(string objectId, string assertionId) =>
        Select(ArcJsonLocation.NewTypeAssertion(Iri.Create(objectId), Iri.Create(assertionId)));

    public string PropertySelector(string objectId, string assertionId) =>
        Select(ArcJsonLocation.NewProperty(Iri.Create(objectId), Iri.Create(assertionId)));

    public string PropertyValueSelector(string objectId, string assertionId) =>
        Select(ArcJsonLocation.NewPropertyValue(Iri.Create(objectId), Iri.Create(assertionId)));

    public string ObjectAnnotationSelector(string objectId, string annotationId) =>
        Select(ArcJsonLocation.NewObjectAnnotation(Iri.Create(objectId), Iri.Create(annotationId)));

    public string ObjectAnnotationValueSelector(string objectId, string annotationId) =>
        Select(ArcJsonLocation.NewObjectAnnotationValue(Iri.Create(objectId), Iri.Create(annotationId)));

    public string PropertyAnnotationSelector(string objectId, string assertionId, string annotationId) =>
        Select(ArcJsonLocation.NewPropertyAnnotation(Iri.Create(objectId), Iri.Create(assertionId), Iri.Create(annotationId)));

    public string PropertyAnnotationValueSelector(string objectId, string assertionId, string annotationId) =>
        Select(ArcJsonLocation.NewPropertyAnnotationValue(Iri.Create(objectId), Iri.Create(assertionId), Iri.Create(annotationId)));

    public string RelationSelector(string relationId) =>
        Select(ArcJsonLocation.NewRelation(Iri.Create(relationId)));

    public string RelationPropertySelector(string relationId, string assertionId) =>
        Select(ArcJsonLocation.NewRelationProperty(Iri.Create(relationId), Iri.Create(assertionId)));

    public string RelationPropertyValueSelector(string relationId, string assertionId) =>
        Select(ArcJsonLocation.NewRelationPropertyValue(Iri.Create(relationId), Iri.Create(assertionId)));

    public string RelationAnnotationSelector(string relationId, string annotationId) =>
        Select(ArcJsonLocation.NewRelationAnnotation(Iri.Create(relationId), Iri.Create(annotationId)));

    public string RelationAnnotationValueSelector(string relationId, string annotationId) =>
        Select(ArcJsonLocation.NewRelationAnnotationValue(Iri.Create(relationId), Iri.Create(annotationId)));

    public string RelationPropertyAnnotationSelector(string relationId, string assertionId, string annotationId) =>
        Select(ArcJsonLocation.NewRelationPropertyAnnotation(Iri.Create(relationId), Iri.Create(assertionId), Iri.Create(annotationId)));

    public string RelationPropertyAnnotationValueSelector(string relationId, string assertionId, string annotationId) =>
        Select(ArcJsonLocation.NewRelationPropertyAnnotationValue(Iri.Create(relationId), Iri.Create(assertionId), Iri.Create(annotationId)));

    private static string Select(ArcJsonLocation location) => ArcIRJson.selector(location).Value;
}
