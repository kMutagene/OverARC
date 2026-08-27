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

    private static WorkspaceService CreateService(string root)
    {
        var interop = new ArcIrInteropAdapter();
        return new WorkspaceService(root, interop, new GraphProjectionBuilder(interop));
    }

    private static object Entry(string id, string label, string path, string sha256) => new { id, label, path, sha256 };

    private static string ExampleState(string name) => File.ReadAllText(Path.Combine(ExampleApiFactory.WorkspaceRoot, "arcir", "states", name));

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

        public void Dispose() => Directory.Delete(Root, recursive: true);
    }
}
