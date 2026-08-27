using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace OverARC.Api;

public sealed class GraphProjectionBuilder(ArcIrInteropAdapter interop)
{
    public GraphProjectionDto Projection(StateArtifact state)
    {
        var graph = state.Root.GetProperty("graph");
        var terms = ReadTerms(graph.GetProperty("terms"));
        var nodes = new Dictionary<string, NodeDto>(StringComparer.Ordinal);
        var relations = new List<RelationDto>();

        foreach (var item in graph.GetProperty("objects").EnumerateObject())
        {
            var id = item.Name;
            var value = item.Value;
            var typeIds = value.GetProperty("types").EnumerateObject()
                .Select(assertion => assertion.Value.GetProperty("term").GetString()!)
                .ToArray();
            var label = ObjectLabel(id, value, terms);
            var search = SearchText(id, label, value, terms, typeIds);
            nodes[id] = new NodeDto(id, label, value.GetProperty("kind").GetString(), typeIds, search, false, interop.ObjectSelector(id));

            foreach (var property in value.GetProperty("properties").EnumerateObject())
            {
                foreach (var reference in References(property.Value.GetProperty("value")))
                {
                    EnsurePlaceholder(nodes, reference);
                    var predicate = property.Value.GetProperty("predicate").GetString()!;
                    var edgeId = "urn:overarc:view:reference:" + Sha256(id + "\n" + property.Name + "\n" + reference);
                    relations.Add(new RelationDto(
                        edgeId,
                        "references",
                        id,
                        predicate,
                        reference,
                        $"{id} references {reference}",
                        true,
                        interop.PropertyValueSelector(id, property.Name)));
                }
            }
        }

        foreach (var item in graph.GetProperty("relations").EnumerateObject())
        {
            var relation = item.Value;
            var subject = relation.GetProperty("subject").GetString()!;
            var predicate = relation.GetProperty("predicate").GetString()!;
            var objectId = relation.GetProperty("object").GetString()!;
            EnsurePlaceholder(nodes, subject);
            EnsurePlaceholder(nodes, objectId);
            var label = TermLabel(predicate, terms);
            var search = string.Join(' ', item.Name, label, predicate, subject, objectId, ValuesText(relation, terms));
            relations.Add(new RelationDto(item.Name, label, subject, predicate, objectId, search, false, interop.RelationSelector(item.Name)));
        }

        // Relation IDs and predicate labels participate in free-text search by
        // enriching both endpoints; terms remain out of the domain graph itself.
        foreach (var relation in relations)
        {
            if (nodes.TryGetValue(relation.Subject, out var subject))
                nodes[relation.Subject] = subject with { SearchText = subject.SearchText + " " + relation.SearchText };
            if (nodes.TryGetValue(relation.Object, out var objectNode))
                nodes[relation.Object] = objectNode with { SearchText = objectNode.SearchText + " " + relation.SearchText };
        }

        return new GraphProjectionDto(
            state.Id,
            state.Sha256,
            terms.Values.OrderBy(term => term.Id, StringComparer.Ordinal).ToArray(),
            nodes.Values.OrderBy(node => node.Id, StringComparer.Ordinal).ToArray(),
            relations.OrderBy(relation => relation.Id, StringComparer.Ordinal).ToArray());
    }

    public ElementDetailDto? Details(StateArtifact state, DetailRequest request)
    {
        var graph = state.Root.GetProperty("graph");
        var terms = ReadTerms(graph.GetProperty("terms"));

        if (string.Equals(request.Kind, "object", StringComparison.OrdinalIgnoreCase)
            && graph.GetProperty("objects").TryGetProperty(request.Id, out var objectValue))
        {
            return ObjectDetails(request.Id, objectValue, terms);
        }

        if (string.Equals(request.Kind, "relation", StringComparison.OrdinalIgnoreCase)
            && graph.GetProperty("relations").TryGetProperty(request.Id, out var relationValue))
        {
            return RelationDetails(request.Id, relationValue, terms);
        }

        return null;
    }

    private ElementDetailDto ObjectDetails(string id, JsonElement value, IReadOnlyDictionary<string, TermDto> terms) =>
        new(
            "object",
            id,
            ObjectLabel(id, value, terms),
            interop.ObjectSelector(id),
            value.GetProperty("kind").GetString(),
            null,
            null,
            null,
            null,
            ReadTypes(id, value.GetProperty("types"), terms),
            ReadProperties(id, false, value.GetProperty("properties"), terms),
            ReadAnnotations(id, null, false, value.GetProperty("annotations"), terms));

    private ElementDetailDto RelationDetails(string id, JsonElement value, IReadOnlyDictionary<string, TermDto> terms)
    {
        var predicate = value.GetProperty("predicate").GetString()!;
        return new(
            "relation",
            id,
            TermLabel(predicate, terms),
            interop.RelationSelector(id),
            null,
            value.GetProperty("subject").GetString(),
            predicate,
            TermLabel(predicate, terms),
            value.GetProperty("object").GetString(),
            [],
            ReadProperties(id, true, value.GetProperty("properties"), terms),
            ReadAnnotations(id, null, true, value.GetProperty("annotations"), terms));
    }

    private IReadOnlyList<TypeAssertionDto> ReadTypes(string ownerId, JsonElement values, IReadOnlyDictionary<string, TermDto> terms) =>
        values.EnumerateObject()
            .Select(item =>
            {
                var termId = item.Value.GetProperty("term").GetString()!;
                return new TypeAssertionDto(item.Name, termId, TermLabel(termId, terms), interop.TypeSelector(ownerId, item.Name));
            })
            .ToArray();

    private IReadOnlyList<PropertyDto> ReadProperties(
        string ownerId,
        bool relationOwner,
        JsonElement values,
        IReadOnlyDictionary<string, TermDto> terms) =>
        values.EnumerateObject()
            .Select(item =>
            {
                var predicate = item.Value.GetProperty("predicate").GetString()!;
                return new PropertyDto(
                    item.Name,
                    predicate,
                    TermLabel(predicate, terms),
                    ReadValue(item.Value.GetProperty("value"), terms),
                    ReadAnnotations(ownerId, item.Name, relationOwner, item.Value.GetProperty("annotations"), terms),
                    relationOwner ? interop.RelationPropertySelector(ownerId, item.Name) : interop.PropertySelector(ownerId, item.Name),
                    relationOwner ? interop.RelationPropertyValueSelector(ownerId, item.Name) : interop.PropertyValueSelector(ownerId, item.Name));
            })
            .ToArray();

    private IReadOnlyList<AnnotationDto> ReadAnnotations(
        string ownerId,
        string? propertyId,
        bool relationOwner,
        JsonElement values,
        IReadOnlyDictionary<string, TermDto> terms) =>
        values.EnumerateObject()
            .Select(item =>
            {
                var property = item.Value.GetProperty("property").GetString()!;
                var selector = relationOwner
                    ? propertyId is null
                        ? interop.RelationAnnotationSelector(ownerId, item.Name)
                        : interop.RelationPropertyAnnotationSelector(ownerId, propertyId, item.Name)
                    : propertyId is null
                        ? interop.ObjectAnnotationSelector(ownerId, item.Name)
                        : interop.PropertyAnnotationSelector(ownerId, propertyId, item.Name);
                var valueSelector = relationOwner
                    ? propertyId is null
                        ? interop.RelationAnnotationValueSelector(ownerId, item.Name)
                        : interop.RelationPropertyAnnotationValueSelector(ownerId, propertyId, item.Name)
                    : propertyId is null
                        ? interop.ObjectAnnotationValueSelector(ownerId, item.Name)
                        : interop.PropertyAnnotationValueSelector(ownerId, propertyId, item.Name);

                return new AnnotationDto(
                    item.Name,
                    property,
                    TermLabel(property, terms),
                    ReadAnnotationValue(item.Value.GetProperty("value"), terms),
                    NullableString(item.Value.GetProperty("evidence")),
                    NullableString(item.Value.GetProperty("source")),
                    selector,
                    valueSelector);
            })
            .ToArray();

    private Dictionary<string, TermDto> ReadTerms(JsonElement values)
    {
        var terms = new Dictionary<string, TermDto>(StringComparer.Ordinal);
        foreach (var item in values.EnumerateObject())
        {
            var name = NullableString(item.Value.GetProperty("name"));
            var source = NullableString(item.Value.GetProperty("source"));
            terms[item.Name] = new TermDto(item.Name, name ?? LocalName(item.Name), name, source, interop.TermSelector(item.Name));
        }
        return terms;
    }

    private static string ObjectLabel(string id, JsonElement value, IReadOnlyDictionary<string, TermDto> terms)
    {
        var candidates = new List<(string Name, string Value)>();
        foreach (var item in value.GetProperty("properties").EnumerateObject())
        {
            var predicate = item.Value.GetProperty("predicate").GetString()!;
            candidates.Add((TermLabel(predicate, terms), ReadValue(item.Value.GetProperty("value"), terms).Display));
        }
        foreach (var item in value.GetProperty("annotations").EnumerateObject())
        {
            var property = item.Value.GetProperty("property").GetString()!;
            candidates.Add((TermLabel(property, terms), ReadAnnotationValue(item.Value.GetProperty("value"), terms).Display));
        }

        string? Pick(Func<string, bool> predicate) =>
            candidates.FirstOrDefault(candidate => predicate(candidate.Name)).Value;

        return Pick(name => name.Equals("Accession", StringComparison.OrdinalIgnoreCase)
                            || name.EndsWith("archive accession", StringComparison.OrdinalIgnoreCase))
               ?? Pick(name => name.Equals("primaryId", StringComparison.OrdinalIgnoreCase))
               ?? Pick(name => name.Equals("Title", StringComparison.OrdinalIgnoreCase))
               ?? Pick(name => name.Equals("Name", StringComparison.OrdinalIgnoreCase))
               ?? id;
    }

    private static string SearchText(
        string id,
        string label,
        JsonElement value,
        IReadOnlyDictionary<string, TermDto> terms,
        IEnumerable<string> typeIds) =>
        string.Join(' ', new[] { id, label }
            .Concat(typeIds.Select(type => TermLabel(type, terms)))
            .Append(ValuesText(value, terms)));

    private static string ValuesText(JsonElement owner, IReadOnlyDictionary<string, TermDto> terms)
    {
        var values = new List<string>();
        foreach (var property in owner.GetProperty("properties").EnumerateObject())
        {
            var predicate = property.Value.GetProperty("predicate").GetString()!;
            values.Add(TermLabel(predicate, terms));
            values.Add(ReadValue(property.Value.GetProperty("value"), terms).Display);
            foreach (var annotation in property.Value.GetProperty("annotations").EnumerateObject())
                values.Add(ReadAnnotationValue(annotation.Value.GetProperty("value"), terms).Display);
        }
        foreach (var annotation in owner.GetProperty("annotations").EnumerateObject())
            values.Add(ReadAnnotationValue(annotation.Value.GetProperty("value"), terms).Display);
        return string.Join(' ', values);
    }

    private static ArcValueDto ReadValue(JsonElement value, IReadOnlyDictionary<string, TermDto> terms)
    {
        var type = value.GetProperty("type").GetString()!;
        var content = value.GetProperty("value");
        return type switch
        {
            "boolean" => new ArcValueDto(type, content.GetBoolean() ? "true" : "false", null, content.GetBoolean(), null),
            "list" => ListValue(content, terms),
            "iri" => TextValue(type, content.GetString()!, TermLabel(content.GetString()!, terms)),
            "ref" => TextValue(type, content.GetString()!, content.GetString()!),
            "integer" => TextValue(type, content.GetRawText(), content.GetRawText()),
            _ => TextValue(type, content.GetString()!, content.GetString()!)
        };
    }

    private static ArcValueDto ListValue(JsonElement content, IReadOnlyDictionary<string, TermDto> terms)
    {
        var items = content.EnumerateArray().Select(item => ReadValue(item, terms)).ToArray();
        return new ArcValueDto("list", string.Join("; ", items.Select(item => item.Display)), null, null, items);
    }

    private static ArcValueDto TextValue(string type, string text, string display) =>
        new(type, display, text, null, null);

    private static AnnotationValueDto ReadAnnotationValue(JsonElement value, IReadOnlyDictionary<string, TermDto> terms)
    {
        var type = value.GetProperty("type").GetString()!;
        return type switch
        {
            "literal" => LiteralAnnotation(type, ReadValue(value.GetProperty("value"), terms), null, terms),
            "literalWithUnit" => LiteralAnnotation(type, ReadValue(value.GetProperty("value"), terms), value.GetProperty("unit").GetString(), terms),
            "term" => TermAnnotation(type, value.GetProperty("value").GetString()!, null, terms),
            "termWithUnit" => TermAnnotation(type, value.GetProperty("value").GetString()!, value.GetProperty("unit").GetString(), terms),
            _ => throw new InvalidDataException($"Unsupported annotation value type '{type}'.")
        };
    }

    private static AnnotationValueDto LiteralAnnotation(
        string type,
        ArcValueDto literal,
        string? unit,
        IReadOnlyDictionary<string, TermDto> terms) =>
        new(type, unit is null ? literal.Display : $"{literal.Display} {TermLabel(unit, terms)}", literal, null, unit);

    private static AnnotationValueDto TermAnnotation(string type, string term, string? unit, IReadOnlyDictionary<string, TermDto> terms) =>
        new(type, unit is null ? TermLabel(term, terms) : $"{TermLabel(term, terms)} {TermLabel(unit, terms)}", null, term, unit);

    private static IEnumerable<string> References(JsonElement value)
    {
        var type = value.GetProperty("type").GetString();
        if (type == "ref") yield return value.GetProperty("value").GetString()!;
        if (type == "list")
            foreach (var item in value.GetProperty("value").EnumerateArray())
                foreach (var reference in References(item))
                    yield return reference;
    }

    private static string TermLabel(string id, IReadOnlyDictionary<string, TermDto> terms) =>
        terms.TryGetValue(id, out var term) ? term.Label : LocalName(id);

    private static string LocalName(string value)
    {
        var cut = Math.Max(value.LastIndexOf('#'), value.LastIndexOf('/'));
        return cut >= 0 && cut + 1 < value.Length ? value[(cut + 1)..] : value;
    }

    private static string? NullableString(JsonElement value) => value.ValueKind == JsonValueKind.Null ? null : value.GetString();

    private static void EnsurePlaceholder(IDictionary<string, NodeDto> nodes, string id)
    {
        if (!nodes.ContainsKey(id)) nodes.Add(id, new NodeDto(id, id, null, [], id, true, null));
    }

    private static string Sha256(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
