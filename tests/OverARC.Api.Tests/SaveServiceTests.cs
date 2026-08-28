using System.Security.Cryptography;
using System.Text;
using OverARC.Api;
using Xunit;

namespace OverARC.Api.Tests;

public sealed class SaveServiceTests
{
    private const string StateId = "state-a";
    private const string Literal = "Fictional Arabidopsis temperature study";
    private const string TargetProject = "urn:overarc:term:project";
    private const string TargetSample = "urn:overarc:term:sample";
    private static readonly DateTimeOffset SaveUtc = new(2026, 8, 28, 14, 30, 0, TimeSpan.Zero);

    [Fact]
    public async Task Save_publishes_exact_successors_and_complete_native_provenance_then_clears_the_draft()
    {
        using var copy = EditableWorkspaceCopy.Create();
        var gitSentinel = Path.Combine(copy.Root, ".git", "overarc-save-sentinel");
        var viewerManifest = Path.Combine(copy.Root, ".overarc", "viewer.json");
        Directory.CreateDirectory(Path.GetDirectoryName(gitSentinel)!);
        Directory.CreateDirectory(Path.GetDirectoryName(viewerManifest)!);
        await File.WriteAllTextAsync(gitSentinel, "unchanged");
        await File.WriteAllTextAsync(viewerManifest, "legacy viewer configuration remains untouched");
        var arcYamlPath = Path.Combine(copy.Root, "arc.yml");
        var predecessorArcPath = Path.Combine(copy.Root, "arcir", "states", "state-a.arcir.json");
        var predecessorMappingPath = Path.Combine(copy.Root, "mappings", "state-a.sssom.tsv");
        var predecessorArc = await File.ReadAllBytesAsync(predecessorArcPath);
        var predecessorMapping = await File.ReadAllBytesAsync(predecessorMappingPath);
        var predecessorArcYaml = await File.ReadAllBytesAsync(arcYamlPath);
        using var services = CreateServices(copy.Root);
        var draft = await services.Drafts.CreateAsync(StateId, "curator@example.org", default);
        var updated = await services.Drafts.AddLiteralMappingAsync(draft.Id, Request(0, TargetProject), default);

        var saved = await services.Save.SaveAsync(updated.Id, updated.Revision, default);

        Assert.Equal(draft.ProcessName, saved.ProcessName);
        Assert.Equal(SaveUtc, saved.SaveUtc);
        Assert.True(saved.MappingCreated);
        Assert.Equal(2, Directory.GetFiles(Path.Combine(copy.Root, "arcir", "states")).Length);
        Assert.Equal(2, Directory.GetFiles(Path.Combine(copy.Root, "mappings")).Length);
        Assert.Equal(predecessorArc, await File.ReadAllBytesAsync(predecessorArcPath));
        Assert.Equal(predecessorMapping, await File.ReadAllBytesAsync(predecessorMappingPath));
        Assert.NotEqual(predecessorArcYaml, await File.ReadAllBytesAsync(arcYamlPath));
        Assert.Equal("unchanged", await File.ReadAllTextAsync(gitSentinel));
        Assert.Equal("legacy viewer configuration remains untouched", await File.ReadAllTextAsync(viewerManifest));
        Assert.False(File.Exists(Path.Combine(copy.Root, ".overarc", "save-journal.json")));
        Assert.False(Directory.Exists(Path.Combine(copy.Root, ".overarc", "staging")));

        var arcSuccessor = await File.ReadAllBytesAsync(Path.Combine(copy.Root, ToSystemPath(saved.ArcIrPath)));
        var mappingSuccessor = await File.ReadAllBytesAsync(Path.Combine(copy.Root, ToSystemPath(saved.MappingPath)));
        Assert.Equal(saved.ArcIrSha256, Sha256(arcSuccessor));
        Assert.Equal(saved.MappingSha256, Sha256(mappingSuccessor));
        Assert.Empty(services.ArcIr.ValidateForEditing(arcSuccessor));
        Assert.Empty(services.Sssom.Validate(mappingSuccessor));
        Assert.Contains("mapping_date", Encoding.UTF8.GetString(mappingSuccessor), StringComparison.Ordinal);
        Assert.Contains("2026-08-28", Encoding.UTF8.GetString(mappingSuccessor), StringComparison.Ordinal);

        var workspace = await services.Workspace.GetWorkspaceAsync(default);
        Assert.Equal(saved.SuccessorStateId, workspace.DefaultStateId);
        var successorState = Assert.Single(workspace.States);
        Assert.True(successorState.Editable);
        Assert.Equal(saved.ArcIrPath, successorState.RelativePath);
        Assert.Equal(saved.MappingPath, successorState.MappingArtifact?.RelativePath);

        var nativeBytes = await File.ReadAllBytesAsync(arcYamlPath);
        Assert.Equal(saved.ArcYamlSha256, Sha256(nativeBytes));
        Assert.Empty(services.ProcessCore.Validate(nativeBytes));
        Assert.Equal(nativeBytes, services.ProcessCore.EncodeCanonical(nativeBytes));
        var native = services.ProcessCore.Inspect(nativeBytes);
        var lanes = native.Processes.Where(process => process.Name == saved.ProcessName).ToArray();
        Assert.Equal(5, lanes.Length);
        Assert.All(lanes, lane =>
        {
            Assert.Contains(lane.FormalParameters, parameter =>
                parameter.Name == "curation transformation" && parameter.NameTan == "CTRO:0000000");
            Assert.Contains(lane.Parameters, parameter =>
                parameter.Name == "curation transformation"
                && parameter.Value == "literal-to-term mapping application"
                && parameter.NameTan == "CTRO:0000000"
                && parameter.ValueTan == "CTRO:0000007");
            Assert.Contains(lane.Parameters, parameter => parameter.Name == "curator" && parameter.Value == "curator@example.org");
            Assert.Contains(lane.Parameters, parameter => parameter.Name == "save time" && parameter.Value == SaveUtc.ToString("O"));
        });
        Assert.Contains(lanes, lane =>
            lane.ProcessType == "artifact succession"
            && lane.Input?.Path == "arcir/states/state-a.arcir.json"
            && lane.Input.Selector is null
            && lane.Output?.Path == saved.ArcIrPath
            && lane.Output.Selector is null);
        Assert.Contains(lanes, lane =>
            lane.ProcessType == "artifact succession"
            && lane.Input?.Path == "mappings/state-a.sssom.tsv"
            && lane.Output?.Path == saved.MappingPath);
        Assert.Contains(lanes.SelectMany(LaneArtifacts), artifact =>
            artifact?.ArtifactType == "ArcIR selected literal"
            && artifact.Path == "arcir/states/state-a.arcir.json"
            && artifact.Selector == updated.Commands[0].Selector);
        Assert.Contains(lanes.SelectMany(LaneArtifacts), artifact =>
            artifact?.ArtifactType == "ArcIR semantic companion"
            && artifact.Path == saved.ArcIrPath
            && artifact.Selector == updated.Commands[0].OutputSelector);
        Assert.Contains(lanes.SelectMany(LaneArtifacts), artifact =>
            artifact?.ArtifactType == "SSSOM mapping record"
            && artifact.Path == saved.MappingPath
            && artifact.Selector == "#row=2"
            && artifact.Annotations.Any(annotation =>
                annotation.Name == "record id" && annotation.Value == updated.Commands[0].MappingRecord.RecordId));
        await Assert.ThrowsAsync<DraftNotFoundException>(() => services.Drafts.GetAsync(updated.Id, default));
    }

    [Fact]
    public async Task Save_reuses_an_exact_mapping_without_changing_its_bytes_or_creating_a_successor()
    {
        using var copy = EditableWorkspaceCopy.Create();
        var mappingPath = Path.Combine(copy.Root, "mappings", "state-a.sssom.tsv");
        var sssom = new SssomInteropAdapter();
        var seeded = sssom.ApplyLiteralMapping(
            await File.ReadAllBytesAsync(mappingPath),
            Literal,
            TargetProject,
            "Project",
            "skos:exactMatch",
            "urn:uuid:01991d8d-04c0-7c3c-8e42-6ca16a0f9342",
            new DateOnly(2026, 8, 1));
        Assert.True(seeded.IsSuccess, string.Join("; ", seeded.Errors));
        await File.WriteAllBytesAsync(mappingPath, seeded.Bytes!);
        await ReplaceDeclaredDigestAsync(copy.Root, "8969eb9923a590dc2a2de6be4d9f214fb77fa3b120566f1fbd266a5f70a77e89", Sha256(seeded.Bytes!));
        var predecessorMapping = await File.ReadAllBytesAsync(mappingPath);
        using var services = CreateServices(copy.Root);
        var draft = await services.Drafts.CreateAsync(StateId, "Curator", default);
        var updated = await services.Drafts.AddLiteralMappingAsync(draft.Id, Request(0, TargetProject), default);
        Assert.False(Assert.Single(updated.Commands).MappingCreated);
        Assert.Equal(updated.BaseSssomSha256, updated.SssomSha256);

        var saved = await services.Save.SaveAsync(updated.Id, updated.Revision, default);

        Assert.False(saved.MappingCreated);
        Assert.Equal("mappings/state-a.sssom.tsv", saved.MappingPath);
        Assert.Equal(predecessorMapping, await File.ReadAllBytesAsync(mappingPath));
        Assert.Single(Directory.GetFiles(Path.Combine(copy.Root, "mappings")));
        Assert.Equal(2, Directory.GetFiles(Path.Combine(copy.Root, "arcir", "states")).Length);
        var lanes = services.ProcessCore.Inspect(await File.ReadAllBytesAsync(Path.Combine(copy.Root, "arc.yml")))
            .Processes.Where(process => process.Name == saved.ProcessName).ToArray();
        Assert.Equal(3, lanes.Length);
        Assert.DoesNotContain(lanes, lane => lane.ProcessType == "mapping creation");
        Assert.DoesNotContain(lanes, lane =>
            lane.ProcessType == "artifact succession" && lane.Input?.ArtifactType == "SSSOM mapping set");
    }

    [Fact]
    public async Task Sequential_branch_save_reuses_the_current_mapping_successor_without_forking_it()
    {
        using var copy = EditableWorkspaceCopy.Create();
        var firstStatePath = Path.Combine(copy.Root, "arcir", "states", "state-a.arcir.json");
        var secondStatePath = Path.Combine(copy.Root, "arcir", "states", "state-b.arcir.json");
        File.Copy(firstStatePath, secondStatePath);
        var arcYamlPath = Path.Combine(copy.Root, "arc.yml");
        var arcYaml = await File.ReadAllTextAsync(arcYamlPath);
        const string mappingEntry = "  - type: Data\n    path: mappings/state-a.sssom.tsv";
        var secondStateEntry = $$"""
          - type: Data
            path: arcir/states/state-b.arcir.json
            additionalType: ArcIR state
            encodingFormat: application/json
            additionalProperty:
              - type: Annotation
                name: sha256
                value: {{Sha256(await File.ReadAllBytesAsync(secondStatePath))}}
        """;
        Assert.Contains(mappingEntry, arcYaml, StringComparison.Ordinal);
        await File.WriteAllTextAsync(
            arcYamlPath,
            arcYaml.Replace(mappingEntry, secondStateEntry + "\n" + mappingEntry, StringComparison.Ordinal),
            new UTF8Encoding(false));
        using var services = CreateServices(copy.Root);

        var firstDraft = await services.Drafts.CreateAsync("state-a", "First curator", default);
        var firstUpdated = await services.Drafts.AddLiteralMappingAsync(
            firstDraft.Id,
            Request(firstDraft.Revision, TargetProject),
            default);
        var firstSaved = await services.Save.SaveAsync(firstUpdated.Id, firstUpdated.Revision, default);

        var secondDraft = await services.Drafts.CreateAsync("state-b", "Second curator", default);
        Assert.Equal(firstSaved.MappingSha256, secondDraft.BaseSssomSha256);
        var secondUpdated = await services.Drafts.AddLiteralMappingAsync(
            secondDraft.Id,
            Request(secondDraft.Revision, TargetProject),
            default);
        Assert.False(Assert.Single(secondUpdated.Commands).MappingCreated);

        var secondSaved = await services.Save.SaveAsync(secondUpdated.Id, secondUpdated.Revision, default);

        Assert.False(secondSaved.MappingCreated);
        Assert.Equal(firstSaved.MappingPath, secondSaved.MappingPath);
        Assert.Equal(firstSaved.MappingSha256, secondSaved.MappingSha256);
        Assert.Equal(4, Directory.GetFiles(Path.Combine(copy.Root, "arcir", "states")).Length);
        Assert.Equal(2, Directory.GetFiles(Path.Combine(copy.Root, "mappings")).Length);
        var workspace = await services.Workspace.GetWorkspaceAsync(default);
        Assert.Equal(2, workspace.States.Count);
        Assert.All(workspace.States, state => Assert.True(state.Editable));
    }

    [Fact]
    public async Task Validation_findings_block_publication_and_leave_the_empty_draft_attached()
    {
        using var copy = EditableWorkspaceCopy.Create();
        var arcYaml = await File.ReadAllBytesAsync(Path.Combine(copy.Root, "arc.yml"));
        using var services = CreateServices(copy.Root);
        var draft = await services.Drafts.CreateAsync(StateId, "Curator", default);

        var error = await Assert.ThrowsAsync<DraftValidationException>(() =>
            services.Save.SaveAsync(draft.Id, draft.Revision, default));

        Assert.Contains(error.Errors, finding => finding.Contains("empty draft", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(arcYaml, await File.ReadAllBytesAsync(Path.Combine(copy.Root, "arc.yml")));
        Assert.Single(Directory.GetFiles(Path.Combine(copy.Root, "arcir", "states")));
        Assert.Single(Directory.GetFiles(Path.Combine(copy.Root, "mappings")));
        Assert.False(File.Exists(Path.Combine(copy.Root, ".overarc", "save-journal.json")));
        Assert.Equal(draft.Id, (await services.Drafts.GetAsync(draft.Id, default)).Id);
    }

    [Fact]
    public async Task A_stale_expected_revision_cannot_enter_the_publication_boundary()
    {
        using var copy = EditableWorkspaceCopy.Create();
        var arcYaml = await File.ReadAllBytesAsync(Path.Combine(copy.Root, "arc.yml"));
        using var services = CreateServices(copy.Root);
        var draft = await services.Drafts.CreateAsync(StateId, "Curator", default);
        var updated = await services.Drafts.AddLiteralMappingAsync(draft.Id, Request(0, TargetProject), default);

        await Assert.ThrowsAsync<DraftConflictException>(() => services.Save.SaveAsync(updated.Id, 0, default));

        Assert.Equal(arcYaml, await File.ReadAllBytesAsync(Path.Combine(copy.Root, "arc.yml")));
        Assert.Single(Directory.GetFiles(Path.Combine(copy.Root, "arcir", "states")));
        Assert.Single(Directory.GetFiles(Path.Combine(copy.Root, "mappings")));
        Assert.Equal(updated.Revision, (await services.Drafts.GetAsync(updated.Id, default)).Revision);
    }

    [Theory]
    [InlineData(SaveBoundary.ArtifactsStaged)]
    [InlineData(SaveBoundary.JournalPrepared)]
    [InlineData(SaveBoundary.ArcIrPublished)]
    [InlineData(SaveBoundary.SssomPublished)]
    [InlineData(SaveBoundary.BeforeArcCommit)]
    [InlineData(SaveBoundary.AfterArcCommit)]
    public async Task Recovery_preserves_the_old_commit_or_completes_each_prepared_publication(SaveBoundary boundary)
    {
        using var copy = EditableWorkspaceCopy.Create();
        var arcYamlPath = Path.Combine(copy.Root, "arc.yml");
        var predecessorArcPath = Path.Combine(copy.Root, "arcir", "states", "state-a.arcir.json");
        var predecessorMappingPath = Path.Combine(copy.Root, "mappings", "state-a.sssom.tsv");
        var oldArcYaml = await File.ReadAllBytesAsync(arcYamlPath);
        var oldArc = await File.ReadAllBytesAsync(predecessorArcPath);
        var oldMapping = await File.ReadAllBytesAsync(predecessorMappingPath);
        using var services = CreateServices(copy.Root, new ThrowAtBoundary(boundary));
        var draft = await services.Drafts.CreateAsync(StateId, "Curator", default);
        var updated = await services.Drafts.AddLiteralMappingAsync(draft.Id, Request(0, TargetProject), default);

        await Assert.ThrowsAsync<InjectedSaveFault>(() => services.Save.SaveAsync(updated.Id, updated.Revision, default));

        var committedAtFault = boundary == SaveBoundary.AfterArcCommit;
        var arcYamlAtFault = await File.ReadAllBytesAsync(arcYamlPath);
        Assert.Equal(committedAtFault, !oldArcYaml.AsSpan().SequenceEqual(arcYamlAtFault));
        var recovery = await services.Save.RecoverAsync(default);
        if (boundary == SaveBoundary.ArtifactsStaged)
        {
            Assert.Equal("none", recovery.Status);
            Assert.Equal(oldArcYaml, await File.ReadAllBytesAsync(arcYamlPath));
            Assert.Single(Directory.GetFiles(Path.Combine(copy.Root, "arcir", "states")));
            Assert.Single(Directory.GetFiles(Path.Combine(copy.Root, "mappings")));
        }
        else
        {
            Assert.Equal("completed", recovery.Status);
            Assert.NotEqual(oldArcYaml, await File.ReadAllBytesAsync(arcYamlPath));
            Assert.Equal(2, Directory.GetFiles(Path.Combine(copy.Root, "arcir", "states")).Length);
            Assert.Equal(2, Directory.GetFiles(Path.Combine(copy.Root, "mappings")).Length);
            var workspace = await services.Workspace.GetWorkspaceAsync(default);
            Assert.Single(workspace.States);
            Assert.True(workspace.States[0].Editable);
            Assert.Equal(recovery.SuccessorArcIrPath, workspace.States[0].RelativePath);
        }

        Assert.Equal(oldArc, await File.ReadAllBytesAsync(predecessorArcPath));
        Assert.Equal(oldMapping, await File.ReadAllBytesAsync(predecessorMappingPath));
        Assert.False(File.Exists(Path.Combine(copy.Root, ".overarc", "save-journal.json")));
        Assert.False(Directory.Exists(Path.Combine(copy.Root, ".overarc", "staging")));
    }

    [Fact]
    public async Task Recovery_removes_uncommitted_outputs_when_prepared_bytes_no_longer_match_the_journal()
    {
        using var copy = EditableWorkspaceCopy.Create();
        var arcYamlPath = Path.Combine(copy.Root, "arc.yml");
        var oldArcYaml = await File.ReadAllBytesAsync(arcYamlPath);
        using var services = CreateServices(copy.Root, new ThrowAtBoundary(SaveBoundary.JournalPrepared));
        var draft = await services.Drafts.CreateAsync(StateId, "Curator", default);
        var updated = await services.Drafts.AddLiteralMappingAsync(draft.Id, Request(0, TargetProject), default);
        await Assert.ThrowsAsync<InjectedSaveFault>(() => services.Save.SaveAsync(updated.Id, updated.Revision, default));
        var stagedArc = Assert.Single(Directory.GetFiles(
            Path.Combine(copy.Root, ".overarc", "staging"),
            "successor.arcir.json",
            SearchOption.AllDirectories));
        await File.WriteAllTextAsync(stagedArc, "corrupt");

        var recovery = await services.Save.RecoverAsync(default);

        Assert.Equal("rolledBack", recovery.Status);
        Assert.Equal(oldArcYaml, await File.ReadAllBytesAsync(arcYamlPath));
        Assert.Single(Directory.GetFiles(Path.Combine(copy.Root, "arcir", "states")));
        Assert.Single(Directory.GetFiles(Path.Combine(copy.Root, "mappings")));
        Assert.False(File.Exists(Path.Combine(copy.Root, ".overarc", "save-journal.json")));
        Assert.False(Directory.Exists(Path.Combine(copy.Root, ".overarc", "staging")));
    }

    [Fact]
    public async Task Concurrent_saves_are_serialized_and_only_one_draft_based_on_the_predecessor_can_publish()
    {
        using var copy = EditableWorkspaceCopy.Create();
        using var services = CreateServices(copy.Root);
        var first = await services.Drafts.CreateAsync(StateId, "First", default);
        var second = await services.Drafts.CreateAsync(StateId, "Second", default);
        var firstUpdated = await services.Drafts.AddLiteralMappingAsync(first.Id, Request(0, TargetProject), default);
        var secondUpdated = await services.Drafts.AddLiteralMappingAsync(second.Id, Request(0, TargetSample, "skos:closeMatch"), default);
        CurationSaveResult? firstResult = null;
        CurationSaveResult? secondResult = null;
        Exception? firstError = null;
        Exception? secondError = null;

        await Task.WhenAll(CaptureFirstAsync(), CaptureSecondAsync());

        Assert.Single(new[] { firstResult, secondResult }, result => result is not null);
        Assert.IsType<DraftConflictException>(Assert.Single(new[] { firstError, secondError }, error => error is not null));
        Assert.Equal(2, Directory.GetFiles(Path.Combine(copy.Root, "arcir", "states")).Length);
        Assert.Equal(2, Directory.GetFiles(Path.Combine(copy.Root, "mappings")).Length);
        var native = services.ProcessCore.Inspect(await File.ReadAllBytesAsync(Path.Combine(copy.Root, "arc.yml")));
        Assert.Single(native.Processes.Select(process => process.Name).Where(name => name.StartsWith("overarc-curation-", StringComparison.Ordinal)).Distinct());

        async Task CaptureFirstAsync()
        {
            try
            {
                firstResult = await services.Save.SaveAsync(firstUpdated.Id, firstUpdated.Revision, default);
            }
            catch (Exception error)
            {
                firstError = error;
            }
        }

        async Task CaptureSecondAsync()
        {
            try
            {
                secondResult = await services.Save.SaveAsync(secondUpdated.Id, secondUpdated.Revision, default);
            }
            catch (Exception error)
            {
                secondError = error;
            }
        }
    }

    private static AddLiteralMappingRequest Request(long revision, string target, string predicate = "skos:exactMatch") =>
        new(
            revision,
            new ArcIrInteropAdapter().PropertyValueSelector(
                "urn:biofsharp:insdc:object:PRJTEST001",
                "urn:overarc:assertion:project-title"),
            Literal,
            target,
            predicate);

    private static IEnumerable<NativeArcArtifact?> LaneArtifacts(NativeArcProcess lane) => [lane.Input, lane.Output];

    private static ServiceScope CreateServices(string root, ISaveFaultInjector? faultInjector = null)
    {
        var arcIr = new ArcIrInteropAdapter();
        var sssom = new SssomInteropAdapter();
        var processCore = new ProcessCoreInteropAdapter();
        var projection = new GraphProjectionBuilder(arcIr);
        var workspace = new WorkspaceService(root, arcIr, sssom, processCore, projection);
        var drafts = new DraftService(workspace, arcIr, sssom, projection, new ManualTimeProvider(SaveUtc));
        var save = new SaveService(workspace, drafts, arcIr, sssom, processCore, new ManualTimeProvider(SaveUtc), faultInjector);
        return new ServiceScope(workspace, drafts, save, arcIr, sssom, processCore);
    }

    private static async Task ReplaceDeclaredDigestAsync(string root, string oldDigest, string newDigest)
    {
        var path = Path.Combine(root, "arc.yml");
        var text = await File.ReadAllTextAsync(path);
        Assert.Contains(oldDigest, text, StringComparison.Ordinal);
        await File.WriteAllTextAsync(path, text.Replace(oldDigest, newDigest, StringComparison.Ordinal), new UTF8Encoding(false));
    }

    private static string ToSystemPath(string path) => path.Replace('/', Path.DirectorySeparatorChar);

    private static string Sha256(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    private sealed record ServiceScope(
        WorkspaceService Workspace,
        DraftService Drafts,
        SaveService Save,
        ArcIrInteropAdapter ArcIr,
        SssomInteropAdapter Sssom,
        ProcessCoreInteropAdapter ProcessCore) : IDisposable
    {
        public void Dispose()
        {
            Save.Dispose();
            Drafts.Dispose();
            Workspace.Dispose();
        }
    }

    private sealed class ManualTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class ThrowAtBoundary(SaveBoundary boundary) : ISaveFaultInjector
    {
        public void Hit(SaveBoundary current)
        {
            if (current == boundary) throw new InjectedSaveFault(current);
        }
    }

    private sealed class InjectedSaveFault(SaveBoundary boundary) : Exception($"Injected save fault at {boundary}.");

    private sealed class EditableWorkspaceCopy(string root) : IDisposable
    {
        public string Root { get; } = root;

        public static EditableWorkspaceCopy Create()
        {
            var source = Path.Combine(ExampleApiFactory.RepositoryRoot, "tests", "fixtures", "editable-workspace");
            var root = Path.Combine(Path.GetTempPath(), "overarc-save-tests", Guid.NewGuid().ToString("N"));
            foreach (var sourcePath in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
            {
                var destination = Path.Combine(root, Path.GetRelativePath(source, sourcePath));
                Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                File.Copy(sourcePath, destination);
            }

            return new EditableWorkspaceCopy(root);
        }

        public void Dispose()
        {
            if (Directory.Exists(Root)) Directory.Delete(Root, recursive: true);
        }
    }
}
