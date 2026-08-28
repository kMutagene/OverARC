using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OverARC.Api;

/// <summary>Named fault boundaries used to prove publication and recovery semantics.</summary>
public enum SaveBoundary
{
    ArtifactsStaged,
    JournalPrepared,
    ArcIrPublished,
    SssomPublished,
    BeforeArcCommit,
    AfterArcCommit
}

/// <summary>Injects deterministic failures at save boundaries; production uses the no-op implementation.</summary>
public interface ISaveFaultInjector
{
    /// <summary>Observes a completed save boundary and may throw to simulate interruption.</summary>
    void Hit(SaveBoundary boundary);
}

/// <summary>Signals validation or provenance failures before publication begins.</summary>
public sealed class SaveValidationException(IReadOnlyList<string> errors)
    : Exception($"Curation save is invalid: {string.Join("; ", errors)}")
{
    /// <summary>Gets every structured save validation finding.</summary>
    public IReadOnlyList<string> Errors { get; } = errors;
}

/// <summary>Reports the immutable successors and semantic commit produced by one successful save.</summary>
public sealed record CurationSaveResult(
    string DraftId,
    string ProcessName,
    DateTimeOffset SaveUtc,
    string SuccessorStateId,
    string ArcIrPath,
    string ArcIrSha256,
    string MappingPath,
    string MappingSha256,
    bool MappingCreated,
    string ArcYamlSha256);

/// <summary>Reports whether interrupted operational state was absent, completed, or rolled back.</summary>
public sealed record SaveRecoveryResult(string Status, string? ProcessName, string? SuccessorArcIrPath);

/// <summary>Publishes validated immutable successors and atomically commits native ARC lineage through arc.yml.</summary>
public sealed class SaveService : IDisposable
{
    private const string ArcYamlRelativePath = "arc.yml";
    private const string StagingRelativePath = ".overarc/staging";
    private const string JournalRelativePath = ".overarc/save-journal.json";
    private const string LockRelativePath = ".overarc/save.lock";
    private static readonly JsonSerializerOptions JournalJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        WriteIndented = true
    };

    private readonly WorkspaceService workspace;
    private readonly DraftService drafts;
    private readonly ArcIrInteropAdapter arcIrInterop;
    private readonly SssomInteropAdapter sssomInterop;
    private readonly ProcessCoreInteropAdapter processCoreInterop;
    private readonly TimeProvider timeProvider;
    private readonly ISaveFaultInjector faultInjector;
    private readonly SemaphoreSlim saveGate = new(1, 1);

    /// <summary>Creates the local publication boundary with injectable time and fault hooks for deterministic tests.</summary>
    public SaveService(
        WorkspaceService workspace,
        DraftService drafts,
        ArcIrInteropAdapter arcIrInterop,
        SssomInteropAdapter sssomInterop,
        ProcessCoreInteropAdapter processCoreInterop,
        TimeProvider? timeProvider = null,
        ISaveFaultInjector? faultInjector = null)
    {
        this.workspace = workspace;
        this.drafts = drafts;
        this.arcIrInterop = arcIrInterop;
        this.sssomInterop = sssomInterop;
        this.processCoreInterop = processCoreInterop;
        this.timeProvider = timeProvider ?? TimeProvider.System;
        this.faultInjector = faultInjector ?? NoSaveFaultInjector.Instance;
    }

    /// <summary>Replays and validates one draft under an exclusive workspace lock, then publishes its successors.</summary>
    public async Task<CurationSaveResult> SaveAsync(
        string draftId,
        long expectedRevision,
        CancellationToken cancellationToken)
    {
        await saveGate.WaitAsync(cancellationToken);
        try
        {
            await using var workspaceLock = await AcquireWorkspaceLockAsync(cancellationToken);
            await RecoverUnderLockAsync(cancellationToken);
            var saveUtc = timeProvider.GetUtcNow();
            return await drafts.ExecuteSaveAsync(
                draftId,
                expectedRevision,
                saveUtc,
                PublishUnderLockAsync,
                cancellationToken);
        }
        finally
        {
            saveGate.Release();
        }
    }

    /// <summary>Recovers or cleans operational state left by an interrupted save without touching predecessors.</summary>
    public async Task<SaveRecoveryResult> RecoverAsync(CancellationToken cancellationToken)
    {
        await saveGate.WaitAsync(cancellationToken);
        try
        {
            await using var workspaceLock = await AcquireWorkspaceLockAsync(cancellationToken);
            return await RecoverUnderLockAsync(cancellationToken);
        }
        finally
        {
            saveGate.Release();
        }
    }

    /// <summary>Validates canonical artifacts, stages them, publishes create-new outputs, and replaces arc.yml last.</summary>
    private async Task<CurationSaveResult> PublishUnderLockAsync(
        DraftSaveMaterialization materialized,
        CancellationToken cancellationToken)
    {
        var validationErrors = arcIrInterop.ValidateForEditing(materialized.ArcIrBytes).ToList();
        validationErrors.AddRange(sssomInterop.Validate(materialized.SssomBytes));
        SssomDocumentSummary? sssomSummary = null;
        if (validationErrors.Count == 0)
        {
            try
            {
                sssomSummary = sssomInterop.Inspect(materialized.SssomBytes);
                if (sssomSummary.SssomVersion != "1.1")
                    validationErrors.Add("Saved mapping artifacts must explicitly declare SSSOM 1.1.");
            }
            catch (Exception error)
            {
                validationErrors.Add($"SSSOM_INSPECTION: {error.Message}");
            }
        }

        if (validationErrors.Count > 0) throw new SaveValidationException(validationErrors);

        var baseState = materialized.BaseState;
        var baseMapping = baseState.MappingArtifact!;
        var processName = materialized.Snapshot.ProcessName;
        var suffix = processName.StartsWith("overarc-curation-", StringComparison.Ordinal)
            ? processName["overarc-curation-".Length..]
            : processName;
        var successorArcPath = SuccessorPath(baseState.RelativePath, ".arcir.json", suffix);
        var mappingChanged = !materialized.SssomBytes.AsSpan().SequenceEqual(baseMapping.Bytes);
        var successorMappingPath = mappingChanged
            ? SuccessorPath(baseMapping.RelativePath, ".sssom.tsv", suffix)
            : baseMapping.RelativePath;
        var successorArcDigest = Sha256(materialized.ArcIrBytes);
        var successorMappingDigest = Sha256(materialized.SssomBytes);
        var arcYamlPath = workspace.ResolveArtifactPathForWrite(ArcYamlRelativePath);
        var baseArcYamlBytes = await File.ReadAllBytesAsync(arcYamlPath, cancellationToken);
        var baseArcYamlDigest = Sha256(baseArcYamlBytes);

        var arcPredecessor = new NativeArtifactRevision(
            baseState.RelativePath,
            baseState.Sha256,
            "ArcIR state",
            "application/json");
        var arcSuccessor = new NativeArtifactRevision(
            successorArcPath,
            successorArcDigest,
            "ArcIR state",
            "application/json");
        var mappingPredecessor = new NativeArtifactRevision(
            baseMapping.RelativePath,
            baseMapping.Sha256,
            "SSSOM mapping set",
            "text/tab-separated-values");
        var mappingSuccessor = mappingChanged
            ? new NativeArtifactRevision(
                successorMappingPath,
                successorMappingDigest,
                "SSSOM mapping set",
                "text/tab-separated-values")
            : null;
        var provenance = processCoreInterop.BuildCurationArc(
            baseArcYamlBytes,
            new ProcessCoreCurationPlan(
                processName,
                materialized.Snapshot.Curator,
                materialized.Snapshot.LastAccessUtc,
                arcPredecessor,
                arcSuccessor,
                mappingPredecessor,
                mappingSuccessor,
                materialized.Snapshot.Commands.Select(command => new NativeCurationOperation(
                    command.Selector,
                    command.OutputSelector,
                    command.Literal,
                    command.TargetTermId,
                    command.PredicateId,
                    command.MappingCreated,
                    command.MappingRecord)).ToArray()));
        if (!provenance.IsSuccess) throw new SaveValidationException(provenance.Errors);
        var arcYamlBytes = provenance.Bytes!;
        var arcYamlDigest = Sha256(arcYamlBytes);

        var stageRelativePath = $"{StagingRelativePath}/{processName}";
        var stagedArcIr = $"{stageRelativePath}/successor.arcir.json";
        var stagedSssom = mappingChanged ? $"{stageRelativePath}/successor.sssom.tsv" : null;
        var stagedArcYaml = $"{stageRelativePath}/arc.yml";
        await WriteNewAsync(workspace.ResolveArtifactPathForWrite(stagedArcIr), materialized.ArcIrBytes, cancellationToken);
        if (stagedSssom is not null)
            await WriteNewAsync(workspace.ResolveArtifactPathForWrite(stagedSssom), materialized.SssomBytes, cancellationToken);
        await WriteNewAsync(workspace.ResolveArtifactPathForWrite(stagedArcYaml), arcYamlBytes, cancellationToken);
        faultInjector.Hit(SaveBoundary.ArtifactsStaged);

        var outputFiles = new List<JournalFile>
        {
            new("arcir", stagedArcIr, successorArcPath, successorArcDigest)
        };
        if (stagedSssom is not null)
            outputFiles.Add(new JournalFile("sssom", stagedSssom, successorMappingPath, successorMappingDigest));
        var journal = new SaveJournal(
            "1.0",
            materialized.Snapshot.Id,
            processName,
            baseArcYamlDigest,
            arcYamlDigest,
            stagedArcYaml,
            successorArcPath,
            outputFiles);
        await WriteJournalAsync(journal, cancellationToken);
        faultInjector.Hit(SaveBoundary.JournalPrepared);

        PublishNew(outputFiles.Single(file => file.Kind == "arcir"));
        faultInjector.Hit(SaveBoundary.ArcIrPublished);
        if (mappingChanged)
        {
            PublishNew(outputFiles.Single(file => file.Kind == "sssom"));
            faultInjector.Hit(SaveBoundary.SssomPublished);
        }

        faultInjector.Hit(SaveBoundary.BeforeArcCommit);
        AtomicReplace(workspace.ResolveArtifactPathForWrite(stagedArcYaml), arcYamlPath);
        faultInjector.Hit(SaveBoundary.AfterArcCommit);
        CleanupJournal(journal);

        var refreshed = await workspace.RefreshAsync(cancellationToken);
        var successorState = refreshed.States.SingleOrDefault(state =>
            state.RelativePath == successorArcPath && state.Sha256 == successorArcDigest)
            ?? throw new WorkspaceException("The committed ArcIR successor was not discovered from native lineage.");
        return new CurationSaveResult(
            materialized.Snapshot.Id,
            processName,
            materialized.Snapshot.LastAccessUtc,
            successorState.Id,
            successorArcPath,
            successorArcDigest,
            successorMappingPath,
            successorMappingDigest,
            mappingChanged,
            arcYamlDigest);
    }

    /// <summary>Finishes a prepared journal when all bytes match, otherwise removes only uncommitted application-owned outputs.</summary>
    private async Task<SaveRecoveryResult> RecoverUnderLockAsync(CancellationToken cancellationToken)
    {
        var journalPath = workspace.ResolveArtifactPathForWrite(JournalRelativePath);
        if (!File.Exists(journalPath))
        {
            CleanupOrphanStaging();
            return new SaveRecoveryResult("none", null, null);
        }

        SaveJournal journal;
        try
        {
            await using var stream = File.OpenRead(journalPath);
            journal = await JsonSerializer.DeserializeAsync<SaveJournal>(stream, JournalJson, cancellationToken)
                ?? throw new WorkspaceException("The save recovery journal is empty.");
        }
        catch (JsonException error)
        {
            throw new WorkspaceException($"The save recovery journal is invalid: {error.Message}");
        }

        if (journal.FormatVersion != "1.0")
            throw new WorkspaceException($"Unsupported save recovery journal version '{journal.FormatVersion}'.");
        var arcYamlPath = workspace.ResolveArtifactPathForWrite(ArcYamlRelativePath);
        var currentArcDigest = Sha256(await File.ReadAllBytesAsync(arcYamlPath, cancellationToken));
        if (currentArcDigest == journal.NewArcYamlSha256)
        {
            EnsurePublishedOutputs(journal);
            CleanupJournal(journal);
            await workspace.RefreshAsync(cancellationToken);
            return new SaveRecoveryResult("completed", journal.ProcessName, journal.SuccessorArcIrPath);
        }

        if (currentArcDigest != journal.BaseArcYamlSha256)
            throw new WorkspaceException("Recovery stopped because arc.yml matches neither the predecessor nor prepared successor digest.");

        if (!CanComplete(journal))
        {
            RollBackPrepared(journal);
            return new SaveRecoveryResult("rolledBack", journal.ProcessName, null);
        }

        foreach (var file in journal.OutputFiles)
            if (!File.Exists(workspace.ResolveArtifactPathForWrite(file.TargetPath))) PublishNew(file);
        AtomicReplace(
            workspace.ResolveArtifactPathForWrite(journal.StagedArcYamlPath),
            arcYamlPath);
        EnsurePublishedOutputs(journal);
        CleanupJournal(journal);
        await workspace.RefreshAsync(cancellationToken);
        return new SaveRecoveryResult("completed", journal.ProcessName, journal.SuccessorArcIrPath);
    }

    /// <summary>Acquires an OS-level exclusive lock so separate server processes serialize workspace saves.</summary>
    private async Task<FileStream> AcquireWorkspaceLockAsync(CancellationToken cancellationToken)
    {
        var path = workspace.ResolveArtifactPathForWrite(LockRelativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                return new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.Asynchronous);
            }
            catch (IOException)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(50), cancellationToken);
            }
        }
    }

    /// <summary>Writes one staged file with create-new and durable flush semantics.</summary>
    private static async Task WriteNewAsync(string path, byte[] bytes, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var stream = new FileStream(
            path,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            81920,
            FileOptions.Asynchronous | FileOptions.WriteThrough);
        await stream.WriteAsync(bytes, cancellationToken);
        await stream.FlushAsync(cancellationToken);
        stream.Flush(flushToDisk: true);
    }

    /// <summary>Durably publishes the prepared recovery journal through an atomic rename.</summary>
    private async Task WriteJournalAsync(SaveJournal journal, CancellationToken cancellationToken)
    {
        var journalPath = workspace.ResolveArtifactPathForWrite(JournalRelativePath);
        var temporaryRelative = $"{JournalRelativePath}.tmp-{Guid.NewGuid():N}";
        var temporaryPath = workspace.ResolveArtifactPathForWrite(temporaryRelative);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(journal, JournalJson);
        await WriteNewAsync(temporaryPath, bytes, cancellationToken);
        File.Move(temporaryPath, journalPath, overwrite: false);
    }

    /// <summary>Moves one staged immutable output to a verified workspace-contained create-new target.</summary>
    private void PublishNew(JournalFile file)
    {
        var staged = workspace.ResolveArtifactPathForWrite(file.StagedPath);
        var target = workspace.ResolveArtifactPathForWrite(file.TargetPath);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.Move(staged, target, overwrite: false);
    }

    /// <summary>Atomically replaces the native semantic commit file with a same-filesystem prepared version.</summary>
    private static void AtomicReplace(string stagedArcYaml, string arcYamlPath) =>
        File.Replace(stagedArcYaml, arcYamlPath, destinationBackupFileName: null, ignoreMetadataErrors: true);

    /// <summary>Tests whether every output and prepared arc.yml remains available with its journaled digest.</summary>
    private bool CanComplete(SaveJournal journal)
    {
        if (!Matches(workspace.ResolveArtifactPathForWrite(journal.StagedArcYamlPath), journal.NewArcYamlSha256)) return false;
        return journal.OutputFiles.All(file =>
            Matches(workspace.ResolveArtifactPathForWrite(file.TargetPath), file.Sha256)
            || Matches(workspace.ResolveArtifactPathForWrite(file.StagedPath), file.Sha256));
    }

    /// <summary>Verifies every output referenced by an already committed native ARC.</summary>
    private void EnsurePublishedOutputs(SaveJournal journal)
    {
        foreach (var file in journal.OutputFiles)
            if (!Matches(workspace.ResolveArtifactPathForWrite(file.TargetPath), file.Sha256))
                throw new WorkspaceException($"Committed recovery output '{file.TargetPath}' is missing or has the wrong digest.");
    }

    /// <summary>Removes exact uncommitted outputs and staging owned by one invalid prepared journal.</summary>
    private void RollBackPrepared(SaveJournal journal)
    {
        foreach (var file in journal.OutputFiles)
        {
            var target = workspace.ResolveArtifactPathForWrite(file.TargetPath);
            if (Matches(target, file.Sha256)) File.Delete(target);
        }
        CleanupJournal(journal);
    }

    /// <summary>Deletes operational journal and staging files after commit or safe rollback.</summary>
    private void CleanupJournal(SaveJournal journal)
    {
        var journalPath = workspace.ResolveArtifactPathForWrite(JournalRelativePath);
        if (File.Exists(journalPath)) File.Delete(journalPath);
        var stageDirectory = workspace.ResolveArtifactPathForWrite($"{StagingRelativePath}/{journal.ProcessName}");
        if (Directory.Exists(stageDirectory)) Directory.Delete(stageDirectory, recursive: true);
        DeleteStagingRootWhenEmpty();
    }

    /// <summary>Removes staging directories left before a recovery journal could be prepared.</summary>
    private void CleanupOrphanStaging()
    {
        var stagingRoot = workspace.ResolveArtifactPathForWrite(StagingRelativePath);
        if (!Directory.Exists(stagingRoot)) return;
        var prefix = stagingRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        foreach (var directory in Directory.GetDirectories(stagingRoot))
        {
            var full = Path.GetFullPath(directory);
            if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                throw new WorkspaceException("An orphan staging path escaped the application staging directory.");
            Directory.Delete(full, recursive: true);
        }
        DeleteStagingRootWhenEmpty();
    }

    /// <summary>Removes the empty application-owned staging root while retaining locks and other operational files.</summary>
    private void DeleteStagingRootWhenEmpty()
    {
        var stagingRoot = workspace.ResolveArtifactPathForWrite(StagingRelativePath);
        if (Directory.Exists(stagingRoot) && !Directory.EnumerateFileSystemEntries(stagingRoot).Any())
            Directory.Delete(stagingRoot);
    }

    /// <summary>Checks one exact file digest without following any path outside workspace resolution.</summary>
    private static bool Matches(string path, string digest) =>
        File.Exists(path) && Sha256(File.ReadAllBytes(path)) == digest;

    /// <summary>Creates a deterministic successor filename beside its immutable predecessor.</summary>
    private static string SuccessorPath(string predecessorPath, string suffix, string identity)
    {
        var normalized = predecessorPath.Replace('\\', '/');
        var separator = normalized.LastIndexOf('/');
        var directory = separator < 0 ? string.Empty : normalized[..separator];
        var filename = separator < 0 ? normalized : normalized[(separator + 1)..];
        var stem = filename.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)
            ? filename[..^suffix.Length]
            : Path.GetFileNameWithoutExtension(filename);
        var successor = $"{stem}.overarc-{identity}{suffix}";
        return string.IsNullOrEmpty(directory) ? successor : $"{directory}/{successor}";
    }

    /// <summary>Computes the lowercase SHA-256 binding used throughout publication and recovery.</summary>
    private static string Sha256(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    /// <summary>Releases the in-process save serialization primitive.</summary>
    public void Dispose() => saveGate.Dispose();

    /// <summary>No-op production fault hook.</summary>
    private sealed class NoSaveFaultInjector : ISaveFaultInjector
    {
        internal static readonly NoSaveFaultInjector Instance = new();

        public void Hit(SaveBoundary boundary)
        {
        }
    }

    /// <summary>One staged immutable output tracked by the private recovery journal.</summary>
    private sealed record JournalFile(string Kind, string StagedPath, string TargetPath, string Sha256);

    /// <summary>Private operational state sufficient to finish or roll back an interrupted semantic commit.</summary>
    private sealed record SaveJournal(
        string FormatVersion,
        string DraftId,
        string ProcessName,
        string BaseArcYamlSha256,
        string NewArcYamlSha256,
        string StagedArcYamlPath,
        string SuccessorArcIrPath,
        IReadOnlyList<JournalFile> OutputFiles);
}
