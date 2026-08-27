using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using OverARC.Api;
using Xunit;

namespace OverARC.Api.Tests;

public sealed class PerformanceTests
{
    [Fact]
    [Trait("Category", "Performance")]
    public async Task Generated_10k_object_25k_relation_state_meets_projection_and_detail_budgets()
    {
        var root = Path.Combine(Path.GetTempPath(), "overarc-benchmark", Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(Path.Combine(root, ".overarc"));
            Directory.CreateDirectory(Path.Combine(root, "arcir", "states"));
            var document = GenerateDocument();
            var statePath = Path.Combine(root, "arcir", "states", "benchmark.arcir.json");
            await File.WriteAllTextAsync(statePath, document, new UTF8Encoding(false));
            var hash = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(statePath))).ToLowerInvariant();
            var manifest = JsonSerializer.Serialize(new
            {
                formatVersion = "1.0",
                name = "Generated benchmark",
                states = new[] { new { id = "benchmark", label = "Benchmark", path = "arcir/states/benchmark.arcir.json", sha256 = hash } }
            });
            await File.WriteAllTextAsync(Path.Combine(root, ".overarc", "viewer.json"), manifest, new UTF8Encoding(false));
            var interop = new ArcIrInteropAdapter();
            using var service = new WorkspaceService(root, interop, new GraphProjectionBuilder(interop));

            var projectionTimer = Stopwatch.StartNew();
            var projection = await service.GetProjectionAsync("benchmark", default);
            projectionTimer.Stop();

            Assert.Equal(10_000, projection.Nodes.Count);
            Assert.Equal(25_000, projection.Relations.Count);
            Assert.True(projectionTimer.Elapsed < TimeSpan.FromSeconds(5), $"Projection took {projectionTimer.Elapsed}.");

            var detailTimer = Stopwatch.StartNew();
            var detail = await service.GetDetailsAsync("benchmark", new DetailRequest("object", "urn:benchmark:object:9999"), default);
            detailTimer.Stop();
            Assert.NotNull(detail);
            Assert.True(detailTimer.Elapsed < TimeSpan.FromMilliseconds(200), $"Detail lookup took {detailTimer.Elapsed}.");
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    private static string GenerateDocument()
    {
        var examplePath = Path.Combine(ExampleApiFactory.WorkspaceRoot, "arcir", "states", "state-b.arcir.json");
        var root = JsonNode.Parse(File.ReadAllText(examplePath))!.AsObject();
        var graph = root["graph"]!.AsObject();
        var objectTemplate = graph["objects"]!.AsObject().First().Value!.DeepClone();
        var relationTemplate = graph["relations"]!.AsObject().First().Value!.DeepClone().AsObject();
        var objects = new JsonObject();
        for (var index = 0; index < 10_000; index++)
            objects[$"urn:benchmark:object:{index}"] = objectTemplate.DeepClone();
        var relations = new JsonObject();
        for (var index = 0; index < 25_000; index++)
        {
            var relation = relationTemplate.DeepClone().AsObject();
            relation["subject"] = $"urn:benchmark:object:{index % 10_000}";
            relation["object"] = $"urn:benchmark:object:{(index * 17 + 1) % 10_000}";
            relations[$"urn:benchmark:relation:{index}"] = relation;
        }
        graph["objects"] = objects;
        graph["relations"] = relations;
        return root.ToJsonString();
    }
}
