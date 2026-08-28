using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using OverARC.Api;
using Xunit;

namespace OverARC.Api.Tests;

public sealed class WorkspaceServiceTests
{
    [Fact]
    public async Task Mixed_valid_and_invalid_states_remain_independently_usable()
    {
        using var workspace = TestWorkspace.Create();
        var valid = workspace.AddState("valid.json", ExampleState("state-a.arcir.json"));
        workspace.WriteManifest([
            Entry("good", "Good", "valid.json", valid.Hash),
            Entry("missing", "Missing", "missing.json", new string('0', 64)),
            Entry("wrong-hash", "Wrong hash", "valid.json", new string('1', 64)),
            Entry("escape", "Escape", "../outside.json", new string('2', 64))
        ]);
        using var service = CreateService(workspace.Root);

        var result = await service.GetWorkspaceAsync(default);

        Assert.Equal("good", result.DefaultStateId);
        Assert.Equal("valid", result.States.Single(state => state.Id == "good").Status);
        Assert.Equal("missing", result.States.Single(state => state.Id == "missing").Status);
        Assert.Equal("digestMismatch", result.States.Single(state => state.Id == "wrong-hash").Status);
        Assert.Equal("invalidPath", result.States.Single(state => state.Id == "escape").Status);
        Assert.NotEmpty((await service.GetProjectionAsync("good", default)).Nodes);
        await Assert.ThrowsAsync<InvalidStateException>(() => service.GetProjectionAsync("missing", default));
    }

    [Fact]
    public async Task Invalid_ArcIR_is_listed_and_returns_invalid_state()
    {
        using var workspace = TestWorkspace.Create();
        var invalid = workspace.AddState("invalid.json", "{}");
        workspace.WriteManifest([Entry("broken", "Broken", "invalid.json", invalid.Hash)]);
        using var service = CreateService(workspace.Root);

        var result = await service.GetWorkspaceAsync(default);

        Assert.Null(result.DefaultStateId);
        Assert.Equal("invalid", result.States[0].Status);
        Assert.NotEmpty(result.States[0].Errors);
        await Assert.ThrowsAsync<InvalidStateException>(() => service.GetProjectionAsync("broken", default));
    }

    [Fact]
    public async Task Newest_state_wins_and_timestamp_ties_use_ordinal_id()
    {
        using var workspace = TestWorkspace.Create();
        var content = ExampleState("state-b.arcir.json");
        var a = workspace.AddState("a.json", content);
        var z = workspace.AddState("z.json", content);
        var sameTime = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(a.Path, sameTime);
        File.SetLastWriteTimeUtc(z.Path, sameTime);
        workspace.WriteManifest([Entry("z-state", "Z", "z.json", z.Hash), Entry("a-state", "A", "a.json", a.Hash)]);
        using var service = CreateService(workspace.Root);

        Assert.Equal("a-state", (await service.GetWorkspaceAsync(default)).DefaultStateId);

        File.SetLastWriteTimeUtc(z.Path, sameTime.AddMinutes(1));
        Assert.Equal("z-state", (await service.RefreshAsync(default)).DefaultStateId);
    }

    [Fact]
    public async Task Refresh_invalidates_cached_bytes_when_manifest_digest_changes()
    {
        using var workspace = TestWorkspace.Create();
        var first = workspace.AddState("current.json", ExampleState("state-b.arcir.json"));
        workspace.WriteManifest([Entry("current", "Current", "current.json", first.Hash)]);
        using var service = CreateService(workspace.Root);
        Assert.Equal(3, (await service.GetWorkspaceAsync(default)).States[0].ObjectCount);

        var second = workspace.AddState("current.json", ExampleState("state-a.arcir.json"));
        workspace.WriteManifest([Entry("current", "Current", "current.json", second.Hash)]);

        var refreshed = await service.RefreshAsync(default);
        Assert.Equal(4, refreshed.States[0].ObjectCount);
        Assert.Equal(second.Hash, (await service.GetProjectionAsync("current", default)).Sha256);
    }

    [Fact]
    public async Task Unsupported_manifest_format_is_rejected()
    {
        using var workspace = TestWorkspace.Create();
        workspace.WriteManifest([], "2.0");
        using var service = CreateService(workspace.Root);
        var error = await Assert.ThrowsAsync<WorkspaceException>(() => service.GetWorkspaceAsync(default));
        Assert.Contains("Unsupported viewer manifest version", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Native_fixture_exposes_one_digest_bound_editable_state_without_writes()
    {
        var root = Path.Combine(ExampleApiFactory.RepositoryRoot, "tests", "fixtures", "editable-workspace");
        var before = Directory.GetFiles(root, "*", SearchOption.AllDirectories)
            .ToDictionary(path => path, path => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))), StringComparer.OrdinalIgnoreCase);
        using var service = CreateService(root);

        var result = await service.GetWorkspaceAsync(default);

        Assert.Equal("nativeArc", result.LineageKind);
        Assert.Equal("arc.yml", result.RelativeManifestPath);
        Assert.Empty(result.Findings!);
        var state = Assert.Single(result.States);
        Assert.Equal("state-a", state.Id);
        Assert.Equal("valid", state.Status);
        Assert.True(state.Editable);
        Assert.Empty(state.CurationErrors!);
        Assert.Equal("1.1", state.MappingArtifact!.SssomVersion);
        Assert.Equal("valid", state.MappingArtifact.Status);
        Assert.Equal(state.Id, result.DefaultStateId);
        Assert.NotEmpty((await service.GetProjectionAsync(state.Id, default)).Nodes);

        var after = Directory.GetFiles(root, "*", SearchOption.AllDirectories)
            .ToDictionary(path => path, path => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))), StringComparer.OrdinalIgnoreCase);
        Assert.Equal(before, after);
    }

    [Fact]
    public async Task Native_lineage_selects_declared_successor_instead_of_newest_timestamp()
    {
        using var workspace = TestWorkspace.Create();
        var oldState = workspace.AddState("arcir/old.arcir.json", EditableState());
        var newState = workspace.AddState("arcir/new.arcir.json", EditableState());
        var mapping = workspace.AddState("mappings/current.sssom.tsv", EditableMapping());
        File.SetLastWriteTimeUtc(oldState.Path, DateTime.UtcNow.AddDays(1));
        File.SetLastWriteTimeUtc(newState.Path, DateTime.UtcNow.AddDays(-1));
        workspace.WriteNativeArc($$"""
            type: Dataset
            identifier: lineage-test
            title: Lineage test
            dataFiles:
            {{NativeData("arcir/old.arcir.json", "ArcIR state", oldState.Hash)}}
            {{NativeData("arcir/new.arcir.json", "ArcIR state", newState.Hash)}}
            {{NativeData("mappings/current.sssom.tsv", "SSSOM mapping set", mapping.Hash)}}
            processes:
              - type: Process
                name: promote
                inputs:
                  - type: Data
                    path: arcir/old.arcir.json
                    additionalType: ArcIR state
                    encodingFormat: application/json
                    additionalProperty:
                      - type: Annotation
                        name: sha256
                        value: {{oldState.Hash}}
                outputs:
                  - type: Data
                    path: arcir/new.arcir.json
                    additionalType: ArcIR state
                    encodingFormat: application/json
                    additionalProperty:
                      - type: Annotation
                        name: sha256
                        value: {{newState.Hash}}
            """);
        using var service = CreateService(workspace.Root);

        var result = await service.GetWorkspaceAsync(default);

        var state = Assert.Single(result.States);
        Assert.Equal("new", state.Id);
        Assert.Equal(newState.Hash, state.Sha256);
        Assert.True(state.Editable);
    }

    [Fact]
    public async Task Branching_native_lineage_lists_successors_but_disables_editing()
    {
        using var workspace = TestWorkspace.Create();
        var oldState = workspace.AddState("arcir/old.arcir.json", EditableState());
        var branchA = workspace.AddState("arcir/branch-a.arcir.json", EditableState());
        var branchB = workspace.AddState("arcir/branch-b.arcir.json", EditableState());
        var mapping = workspace.AddState("mappings/current.sssom.tsv", EditableMapping());
        workspace.WriteNativeArc($$"""
            type: Dataset
            identifier: branch-test
            dataFiles:
            {{NativeData("arcir/old.arcir.json", "ArcIR state", oldState.Hash)}}
            {{NativeData("arcir/branch-a.arcir.json", "ArcIR state", branchA.Hash)}}
            {{NativeData("arcir/branch-b.arcir.json", "ArcIR state", branchB.Hash)}}
            {{NativeData("mappings/current.sssom.tsv", "SSSOM mapping set", mapping.Hash)}}
            processes:
            {{NativeProcess("branch-a", "arcir/old.arcir.json", oldState.Hash, "arcir/branch-a.arcir.json", branchA.Hash)}}
            {{NativeProcess("branch-b", "arcir/old.arcir.json", oldState.Hash, "arcir/branch-b.arcir.json", branchB.Hash)}}
            """);
        using var service = CreateService(workspace.Root);

        var result = await service.GetWorkspaceAsync(default);

        Assert.Null(result.DefaultStateId);
        Assert.Equal(2, result.States.Count);
        Assert.All(result.States, state =>
        {
            Assert.Equal("valid", state.Status);
            Assert.False(state.Editable);
            Assert.Contains(state.CurationErrors!, error => error.Contains("branches", StringComparison.Ordinal));
        });
    }

    [Fact]
    public async Task Invalid_native_mapping_is_reported_without_hiding_valid_ArcIR()
    {
        using var workspace = TestWorkspace.Create();
        var state = workspace.AddState("arcir/current.arcir.json", EditableState());
        workspace.WriteNativeArc($$"""
            type: Dataset
            identifier: invalid-mapping-test
            dataFiles:
            {{NativeData("arcir/current.arcir.json", "ArcIR state", state.Hash)}}
            {{NativeData("../outside.sssom.tsv", "SSSOM mapping set", new string('0', 64))}}
            """);
        using var service = CreateService(workspace.Root);

        var result = await service.GetWorkspaceAsync(default);

        var summary = Assert.Single(result.States);
        Assert.Equal("valid", summary.Status);
        Assert.False(summary.Editable);
        Assert.Equal("invalidPath", summary.MappingArtifact!.Status);
        Assert.Contains(result.Findings!, finding => finding.Contains("escapes the workspace root", StringComparison.Ordinal));
        Assert.NotEmpty((await service.GetProjectionAsync(summary.Id, default)).Nodes);
    }

    [Fact]
    public async Task Native_ArcIR_failures_are_independent_and_actionable()
    {
        using var workspace = TestWorkspace.Create();
        var valid = workspace.AddState("arcir/valid.arcir.json", EditableState());
        var invalid = workspace.AddState("arcir/invalid.arcir.json", "{}");
        var mismatch = workspace.AddState("arcir/mismatch.arcir.json", EditableState());
        var mapping = workspace.AddState("mappings/current.sssom.tsv", EditableMapping());
        workspace.WriteNativeArc($$"""
            type: Dataset
            identifier: independent-errors-test
            dataFiles:
            {{NativeData("arcir/valid.arcir.json", "ArcIR state", valid.Hash)}}
            {{NativeData("arcir/invalid.arcir.json", "ArcIR state", invalid.Hash)}}
            {{NativeData("arcir/mismatch.arcir.json", "ArcIR state", new string('1', 64))}}
            {{NativeData("arcir/missing.arcir.json", "ArcIR state", new string('2', 64))}}
            {{NativeData("mappings/current.sssom.tsv", "SSSOM mapping set", mapping.Hash)}}
            """);
        using var service = CreateService(workspace.Root);

        var result = await service.GetWorkspaceAsync(default);

        Assert.Equal(4, result.States.Count);
        Assert.Equal("valid", result.States.Single(state => state.Id == "valid").Status);
        Assert.Equal("invalid", result.States.Single(state => state.Id == "invalid").Status);
        Assert.Equal("digestMismatch", result.States.Single(state => state.Id == "mismatch").Status);
        Assert.Equal("missing", result.States.Single(state => state.Id == "missing").Status);
        Assert.NotEmpty((await service.GetProjectionAsync("valid", default)).Nodes);
        await Assert.ThrowsAsync<InvalidStateException>(() => service.GetProjectionAsync("invalid", default));
    }

    private static WorkspaceService CreateService(string root)
    {
        var interop = new ArcIrInteropAdapter();
        return new WorkspaceService(root, interop, new GraphProjectionBuilder(interop));
    }

    private static object Entry(string id, string label, string path, string sha256) => new { id, label, path, sha256 };

    private static string ExampleState(string name) => File.ReadAllText(Path.Combine(ExampleApiFactory.WorkspaceRoot, "arcir", "states", name));

    private static string EditableState() => File.ReadAllText(Path.Combine(
        ExampleApiFactory.RepositoryRoot,
        "tests",
        "fixtures",
        "editable-workspace",
        "arcir",
        "states",
        "state-a.arcir.json"));

    private static string EditableMapping() => File.ReadAllText(Path.Combine(
        ExampleApiFactory.RepositoryRoot,
        "tests",
        "fixtures",
        "editable-workspace",
        "mappings",
        "state-a.sssom.tsv"));

    private static string NativeData(string path, string artifactType, string sha256) => $$"""
          - type: Data
            path: {{path}}
            additionalType: {{artifactType}}
            encodingFormat: {{(artifactType == "ArcIR state" ? "application/json" : "text/tab-separated-values")}}
            additionalProperty:
              - type: Annotation
                name: sha256
                value: {{sha256}}
        """;

    private static string NativeProcess(string name, string inputPath, string inputHash, string outputPath, string outputHash) => $$"""
          - type: Process
            name: {{name}}
            inputs:
              - type: Data
                path: {{inputPath}}
                additionalType: ArcIR state
                encodingFormat: application/json
                additionalProperty:
                  - type: Annotation
                    name: sha256
                    value: {{inputHash}}
            outputs:
              - type: Data
                path: {{outputPath}}
                additionalType: ArcIR state
                encodingFormat: application/json
                additionalProperty:
                  - type: Annotation
                    name: sha256
                    value: {{outputHash}}
        """;

    private sealed class TestWorkspace(string root) : IDisposable
    {
        public string Root { get; } = root;

        public static TestWorkspace Create()
        {
            var root = Path.Combine(Path.GetTempPath(), "overarc-tests", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path.Combine(root, ".overarc"));
            return new TestWorkspace(root);
        }

        public (string Path, string Hash) AddState(string relativePath, string content)
        {
            var path = Path.Combine(Root, relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, content, new UTF8Encoding(false));
            var hash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant();
            return (path, hash);
        }

        public void WriteManifest(object[] states, string formatVersion = "1.0")
        {
            var json = JsonSerializer.Serialize(new { formatVersion, name = "Test workspace", states }, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(Path.Combine(Root, ".overarc", "viewer.json"), json, new UTF8Encoding(false));
        }

        public void WriteNativeArc(string yaml) =>
            File.WriteAllText(Path.Combine(Root, "arc.yml"), yaml, new UTF8Encoding(false));

        public void Dispose() => Directory.Delete(Root, recursive: true);
    }
}
