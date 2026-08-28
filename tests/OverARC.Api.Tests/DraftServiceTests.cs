using System.Security.Cryptography;
using OverARC.Api;
using Xunit;

namespace OverARC.Api.Tests;

public sealed class DraftServiceTests
{
    private const string StateId = "state-a";
    private const string Literal = "Fictional Arabidopsis temperature study";
    private const string TargetProject = "urn:overarc:term:project";
    private const string TargetSample = "urn:overarc:term:sample";

    [Fact]
    public async Task Replay_is_deterministic_exact_mapping_reuse_changes_no_bytes_and_undo_restores_bases()
    {
        var root = EditableWorkspaceRoot;
        var before = WorkspaceHashes(root);
        var clock = new ManualTimeProvider(new DateTimeOffset(2026, 8, 28, 12, 0, 0, TimeSpan.Zero));
        using var services = CreateServices(root, clock);
        var created = await services.Drafts.CreateAsync(StateId, "curator@example.org", default);
        Assert.StartsWith("overarc-curation-", created.ProcessName, StringComparison.Ordinal);
        Assert.Equal(created.BaseArcIrSha256, created.ArcIrSha256);
        Assert.Equal(created.BaseSssomSha256, created.SssomSha256);

        var first = await services.Drafts.AddLiteralMappingAsync(
            created.Id,
            Request(created.Revision, TargetProject),
            default);
        var firstCommand = Assert.Single(first.Commands);
        Assert.True(firstCommand.MappingCreated);
        Assert.StartsWith("urn:uuid:", firstCommand.ProposedRecordId, StringComparison.Ordinal);
        Assert.Equal(firstCommand.ProposedRecordId, firstCommand.MappingRecord.RecordId);
        Assert.Equal("Added", firstCommand.ArcIrStatus);
        Assert.NotEqual(first.BaseArcIrSha256, first.ArcIrSha256);
        Assert.NotEqual(first.BaseSssomSha256, first.SssomSha256);

        var replayed = await services.Drafts.AddLiteralMappingAsync(
            first.Id,
            Request(first.Revision, TargetProject),
            default);
        Assert.Equal(first.ArcIrSha256, replayed.ArcIrSha256);
        Assert.Equal(first.SssomSha256, replayed.SssomSha256);
        Assert.True(replayed.Commands[0].MappingCreated);
        Assert.False(replayed.Commands[1].MappingCreated);
        Assert.Equal(firstCommand.MappingRecord.RecordId, replayed.Commands[1].MappingRecord.RecordId);
        Assert.Equal("AlreadyPresent", replayed.Commands[1].ArcIrStatus);

        var withoutDuplicate = await services.Drafts.RemoveCommandAsync(
            replayed.Id,
            new RemoveDraftCommandRequest(replayed.Revision, replayed.Commands[1].Id),
            default);
        Assert.Equal(first.ArcIrSha256, withoutDuplicate.ArcIrSha256);
        Assert.Equal(first.SssomSha256, withoutDuplicate.SssomSha256);

        var empty = await services.Drafts.RemoveCommandAsync(
            withoutDuplicate.Id,
            new RemoveDraftCommandRequest(withoutDuplicate.Revision, withoutDuplicate.Commands[0].Id),
            default);
        Assert.Empty(empty.Commands);
        Assert.Equal(empty.BaseArcIrSha256, empty.ArcIrSha256);
        Assert.Equal(empty.BaseSssomSha256, empty.SssomSha256);
        Assert.Equal(before, WorkspaceHashes(root));
    }

    [Fact]
    public async Task Multiple_targets_survive_replay_and_removing_any_command_rebuilds_the_expected_state()
    {
        using var services = CreateServices(EditableWorkspaceRoot);
        var draft = await services.Drafts.CreateAsync(StateId, "Curator", default);
        var first = await services.Drafts.AddLiteralMappingAsync(draft.Id, Request(0, TargetProject), default);
        var second = await services.Drafts.AddLiteralMappingAsync(first.Id, Request(1, TargetSample, "skos:closeMatch"), default);

        Assert.Equal(2, second.Commands.Count);
        Assert.All(second.Commands, command => Assert.True(command.MappingCreated));
        Assert.Equal(2, second.Commands.Select(command => command.MappingRecord.ObjectId).Distinct().Count());
        var projection = await services.Drafts.GetProjectionAsync(second.Id, default);
        Assert.Contains(projection.Terms.Single(term => term.Id == TargetProject).UsageRoles, role => role == "termValue");
        Assert.Contains(projection.Terms.Single(term => term.Id == TargetSample).UsageRoles, role => role == "termValue");

        var removeSecond = await services.Drafts.RemoveCommandAsync(
            second.Id,
            new RemoveDraftCommandRequest(second.Revision, second.Commands[1].Id),
            default);
        Assert.Equal(first.ArcIrSha256, removeSecond.ArcIrSha256);
        Assert.Equal(first.SssomSha256, removeSecond.SssomSha256);

        var addSecondAgain = await services.Drafts.AddLiteralMappingAsync(
            removeSecond.Id,
            Request(removeSecond.Revision, TargetSample, "skos:closeMatch"),
            default);
        var removeFirst = await services.Drafts.RemoveCommandAsync(
            addSecondAgain.Id,
            new RemoveDraftCommandRequest(addSecondAgain.Revision, addSecondAgain.Commands[0].Id),
            default);
        var survivor = Assert.Single(removeFirst.Commands);
        Assert.Equal(TargetSample, survivor.TargetTermId);
        Assert.True(survivor.MappingCreated);
        Assert.Equal(survivor.ProposedRecordId, survivor.MappingRecord.RecordId);
    }

    [Fact]
    public async Task Stale_and_invalid_mutations_leave_the_draft_unchanged()
    {
        using var services = CreateServices(EditableWorkspaceRoot);
        var draft = await services.Drafts.CreateAsync(StateId, "Curator", default);
        var updated = await services.Drafts.AddLiteralMappingAsync(draft.Id, Request(0, TargetProject), default);

        await Assert.ThrowsAsync<DraftConflictException>(() =>
            services.Drafts.AddLiteralMappingAsync(updated.Id, Request(0, TargetSample), default));
        var unsupported = Request(updated.Revision, TargetSample) with
        {
            Selector = services.ArcIr.PropertyValueSelector(
                "urn:biofsharp:insdc:object:PRJTEST001",
                "urn:overarc:assertion:project-list"),
            Literal = "control"
        };
        await Assert.ThrowsAsync<DraftValidationException>(() =>
            services.Drafts.AddLiteralMappingAsync(updated.Id, unsupported, default));
        await Assert.ThrowsAsync<DraftValidationException>(() =>
            services.Drafts.AddLiteralMappingAsync(updated.Id, Request(updated.Revision, TargetSample, "owl:sameAs"), default));
        await Assert.ThrowsAsync<DraftValidationException>(() =>
            services.Drafts.AddLiteralMappingAsync(updated.Id, Request(updated.Revision, "urn:not:registered"), default));

        var unchanged = await services.Drafts.GetAsync(updated.Id, default);
        Assert.Equal(updated.Revision, unchanged.Revision);
        Assert.Equal(updated.ArcIrSha256, unchanged.ArcIrSha256);
        Assert.Equal(updated.SssomSha256, unchanged.SssomSha256);
        Assert.Single(unchanged.Commands);
    }

    [Fact]
    public async Task Changed_base_digest_invalidates_a_live_draft()
    {
        using var copy = EditableWorkspaceCopy.Create();
        using var services = CreateServices(copy.Root);
        var draft = await services.Drafts.CreateAsync(StateId, "Curator", default);
        var statePath = Path.Combine(copy.Root, "arcir", "states", "state-a.arcir.json");
        await File.AppendAllTextAsync(statePath, "\n");

        var error = await Assert.ThrowsAsync<DraftConflictException>(() =>
            services.Drafts.AddLiteralMappingAsync(draft.Id, Request(0, TargetProject), default));

        Assert.Contains("base is no longer current", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Drafts_expire_after_twenty_four_hours_and_a_new_service_cannot_reattach()
    {
        var clock = new ManualTimeProvider(new DateTimeOffset(2026, 8, 28, 12, 0, 0, TimeSpan.Zero));
        using var services = CreateServices(EditableWorkspaceRoot, clock);
        var draft = await services.Drafts.CreateAsync(StateId, "Curator", default);
        clock.Advance(TimeSpan.FromHours(24));

        await Assert.ThrowsAsync<DraftNotFoundException>(() => services.Drafts.GetAsync(draft.Id, default));

        using var restarted = new DraftService(
            services.Workspace,
            services.ArcIr,
            services.Sssom,
            services.Projection,
            clock);
        await Assert.ThrowsAsync<DraftNotFoundException>(() => restarted.GetAsync(draft.Id, default));
    }

    private static string EditableWorkspaceRoot => Path.Combine(
        ExampleApiFactory.RepositoryRoot,
        "tests",
        "fixtures",
        "editable-workspace");

    private static AddLiteralMappingRequest Request(long revision, string target, string predicate = "skos:exactMatch") =>
        new(
            revision,
            new ArcIrInteropAdapter().PropertyValueSelector(
                "urn:biofsharp:insdc:object:PRJTEST001",
                "urn:overarc:assertion:project-title"),
            Literal,
            target,
            predicate);

    private static ServiceScope CreateServices(string root, TimeProvider? clock = null)
    {
        var arcIr = new ArcIrInteropAdapter();
        var sssom = new SssomInteropAdapter();
        var projection = new GraphProjectionBuilder(arcIr);
        var workspace = new WorkspaceService(root, arcIr, sssom, new ProcessCoreInteropAdapter(), projection);
        return new ServiceScope(workspace, new DraftService(workspace, arcIr, sssom, projection, clock), arcIr, sssom, projection);
    }

    private static Dictionary<string, string> WorkspaceHashes(string root) =>
        Directory.GetFiles(root, "*", SearchOption.AllDirectories)
            .ToDictionary(
                path => Path.GetRelativePath(root, path),
                path => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))),
                StringComparer.OrdinalIgnoreCase);

    private sealed record ServiceScope(
        WorkspaceService Workspace,
        DraftService Drafts,
        ArcIrInteropAdapter ArcIr,
        SssomInteropAdapter Sssom,
        GraphProjectionBuilder Projection) : IDisposable
    {
        public void Dispose()
        {
            Drafts.Dispose();
            Workspace.Dispose();
        }
    }

    private sealed class ManualTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        private DateTimeOffset utcNow = utcNow;

        public override DateTimeOffset GetUtcNow() => utcNow;

        public void Advance(TimeSpan duration) => utcNow += duration;
    }

    private sealed class EditableWorkspaceCopy(string root) : IDisposable
    {
        public string Root { get; } = root;

        public static EditableWorkspaceCopy Create()
        {
            var source = EditableWorkspaceRoot;
            var root = Path.Combine(Path.GetTempPath(), "overarc-draft-tests", Guid.NewGuid().ToString("N"));
            foreach (var sourcePath in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
            {
                var destination = Path.Combine(root, Path.GetRelativePath(source, sourcePath));
                Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                File.Copy(sourcePath, destination);
            }

            return new EditableWorkspaceCopy(root);
        }

        public void Dispose() => Directory.Delete(Root, recursive: true);
    }
}
