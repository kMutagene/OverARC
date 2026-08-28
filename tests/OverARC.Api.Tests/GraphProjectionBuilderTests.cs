using System.Text.Json;
using OverARC.Api;
using Xunit;

namespace OverARC.Api.Tests;

public sealed class GraphProjectionBuilderTests
{
    [Fact]
    public void Term_usage_covers_every_role_and_keeps_unused_definitions()
    {
        using var document = JsonDocument.Parse(
            """
            {
              "formatVersion": "1.0",
              "graph": {
                "terms": {
                  "urn:test:term:type": { "name": "Type", "source": "test" },
                  "urn:test:term:object-predicate": { "name": "Object predicate", "source": "test" },
                  "urn:test:term:relation-predicate": { "name": "Relation predicate", "source": "test" },
                  "urn:test:term:relation-property": { "name": "Relation property", "source": "test" },
                  "urn:test:term:annotation": { "name": "Annotation", "source": "test" },
                  "urn:test:term:value": { "name": "Value", "source": "test" },
                  "urn:test:term:unit": { "name": "Unit", "source": "test" },
                  "urn:test:term:unused": { "name": "Unused", "source": null }
                },
                "objects": {
                  "urn:test:object:one": {
                    "kind": "observable",
                    "types": {
                      "urn:test:assertion:type": { "term": "urn:test:term:type" }
                    },
                    "properties": {
                      "urn:test:assertion:property": {
                        "predicate": "urn:test:term:object-predicate",
                        "value": {
                          "type": "list",
                          "value": [{ "type": "iri", "value": "urn:test:term:value" }]
                        },
                        "annotations": {
                          "urn:test:annotation:property": {
                            "property": "urn:test:term:annotation",
                            "value": {
                              "type": "termWithUnit",
                              "value": "urn:test:term:value",
                              "unit": "urn:test:term:unit"
                            },
                            "evidence": null,
                            "source": null
                          }
                        }
                      }
                    },
                    "annotations": {
                      "urn:test:annotation:object": {
                        "property": "urn:test:term:annotation",
                        "value": {
                          "type": "literalWithUnit",
                          "value": { "type": "iri", "value": "urn:test:term:value" },
                          "unit": "urn:test:term:unit"
                        },
                        "evidence": null,
                        "source": null
                      }
                    }
                  }
                },
                "relations": {
                  "urn:test:relation:one": {
                    "subject": "urn:test:object:one",
                    "predicate": "urn:test:term:relation-predicate",
                    "object": "urn:test:object:one",
                    "properties": {
                      "urn:test:assertion:relation-property": {
                        "predicate": "urn:test:term:relation-property",
                        "value": { "type": "iri", "value": "urn:test:term:value" },
                        "annotations": {}
                      }
                    },
                    "annotations": {
                      "urn:test:annotation:relation": {
                        "property": "urn:test:term:annotation",
                        "value": { "type": "term", "value": "urn:test:term:value" },
                        "evidence": null,
                        "source": null
                      }
                    }
                  }
                }
              }
            }
            """);
        var state = new StateArtifact(
            "state",
            "State",
            "state.arcir.json",
            "state.arcir.json",
            "digest",
            DateTimeOffset.UnixEpoch,
            document);
        var builder = new GraphProjectionBuilder(new ArcIrInteropAdapter());

        var projection = builder.Projection(state);
        var expectedRoles = new Dictionary<string, string>
        {
            ["urn:test:term:type"] = "objectType",
            ["urn:test:term:object-predicate"] = "objectPropertyPredicate",
            ["urn:test:term:relation-predicate"] = "relationPredicate",
            ["urn:test:term:relation-property"] = "relationPropertyPredicate",
            ["urn:test:term:annotation"] = "annotationProperty",
            ["urn:test:term:value"] = "termValue",
            ["urn:test:term:unit"] = "unit"
        };

        foreach (var (termId, role) in expectedRoles)
        {
            var summary = Assert.Single(projection.Terms, term => term.Id == termId);
            Assert.Contains(role, summary.UsageRoles);
            var detail = builder.TermDetails(state, new TermDetailRequest(termId));
            Assert.NotNull(detail);
            Assert.Equal(summary.UsageCount, detail.Usages.Count);
            Assert.Equal(summary.UsageRoles, detail.UsageRoles);
            Assert.All(detail.Usages, usage => Assert.False(string.IsNullOrWhiteSpace(usage.Selector)));
        }

        var unused = Assert.Single(projection.Terms, term => term.Id == "urn:test:term:unused");
        Assert.Equal(0, unused.UsageCount);
        Assert.Empty(unused.UsageRoles);
        Assert.Empty(builder.TermDetails(state, new TermDetailRequest(unused.Id))!.Usages);
    }
}
