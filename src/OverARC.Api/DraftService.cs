using System.Security.Cryptography;
using System.Text.Json;

namespace OverARC.Api;

/// <summary>Signals that an in-memory draft is unknown or has expired.</summary>
public sealed class DraftNotFoundException(string draftId)
    : Exception($"Draft '{draftId}' does not exist or has expired.");

/// <summary>Signals that an operation resource is not present in the selected live draft.</summary>
public sealed class DraftOperationNotFoundException(string draftId, string operationId)
    : Exception($"Operation '{operationId}' is not present in draft '{draftId}'.");

/// <summary>Signals optimistic-concurrency or immutable-base conflicts for a draft.</summary>
public sealed class DraftConflictException(string message) : Exception(message);

/// <summary>Signals that typed command replay failed without changing the stored draft.</summary>
public sealed class DraftValidationException(IReadOnlyList<string> errors)
    : Exception($"Draft command is invalid: {string.Join("; ", errors)}")
{
    /// <summary>Gets every core-library or command validation failure.</summary>
    public IReadOnlyList<string> Errors { get; } = errors;
}

/// <summary>Request to append one typed selected-literal mapping command at an expected draft revision.</summary>
public sealed record AddLiteralMappingRequest(
    long ExpectedRevision,
    string Selector,
    string Literal,
    string TargetTermId,
    string PredicateId);

/// <summary>Request to remove one typed command and replay its siblings at an expected revision.</summary>
public sealed record RemoveDraftCommandRequest(long ExpectedRevision, string CommandId);

/// <summary>One replayed command and the exact ArcIR/SSSOM occurrences it used or produced.</summary>
public sealed record DraftCommandSummary(
    string Id,
    string Selector,
    string Literal,
    string TargetTermId,
    string TargetTermLabel,
    string PredicateId,
    string ProposedRecordId,
    string OutputSelector,
    string ArcIrStatus,
    bool MappingCreated,
    SssomMappingRecord MappingRecord);

/// <summary>Immutable client-safe snapshot of one server-owned in-memory curation draft.</summary>
public sealed record CurationDraftSnapshot(
    string Id,
    string StateId,
    long Revision,
    string ProcessName,
    string Curator,
    DateTimeOffset CreatedUtc,
    DateTimeOffset LastAccessUtc,
    string BaseArcIrSha256,
    string BaseSssomSha256,
    string ArcIrSha256,
    string SssomSha256,
    IReadOnlyList<DraftCommandSummary> Commands);

/// <summary>Owns expiring drafts and rebuilds their immutable artifacts by replaying typed commands from exact bases.</summary>
public sealed class DraftService : IDisposable
{
    private static readonly TimeSpan InactivityLifetime = TimeSpan.FromHours(24);
    private static readonly HashSet<string> SupportedPredicates =
    [
        "skos:exactMatch",
        "skos:closeMatch",
        "skos:broadMatch",
        "skos:narrowMatch",
        "skos:relatedMatch"
    ];

    private readonly WorkspaceService workspace;
    private readonly ArcIrInteropAdapter arcIrInterop;
    private readonly SssomInteropAdapter sssomInterop;
    private readonly GraphProjectionBuilder projectionBuilder;
    private readonly TimeProvider timeProvider;
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly Dictionary<string, DraftState> drafts = new(StringComparer.Ordinal);

    /// <summary>Creates an in-memory draft owner with an injectable clock for deterministic expiry tests.</summary>
    public DraftService(
        WorkspaceService workspace,
        ArcIrInteropAdapter arcIrInterop,
        SssomInteropAdapter sssomInterop,
        GraphProjectionBuilder projectionBuilder,
        TimeProvider? timeProvider = null)
    {
        this.workspace = workspace;
        this.arcIrInterop = arcIrInterop;
        this.sssomInterop = sssomInterop;
        this.projectionBuilder = projectionBuilder;
        this.timeProvider = timeProvider ?? TimeProvider.System;
    }

    /// <summary>Starts a draft only when the selected native state has exact valid ArcIR and SSSOM bases.</summary>
    public async Task<CurationDraftSnapshot> CreateAsync(string stateId, string curator, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(curator))
            throw new DraftValidationException(["A non-empty curator identity is required."]);

        var state = await workspace.GetStateArtifactAsync(stateId, cancellationToken);
        if (state.MappingArtifact is null)
            throw new DraftValidationException(["The selected state has no valid unambiguous SSSOM 1.1 base."]);

        var now = timeProvider.GetUtcNow();
        var draft = new DraftState(
            Guid.CreateVersion7(now).ToString(),
            state,
            curator.Trim(),
            $"overarc-curation-{Guid.CreateVersion7(now)}",
            now);

        await gate.WaitAsync(cancellationToken);
        try
        {
            RemoveExpired(now);
            drafts.Add(draft.Id, draft);
            return Snapshot(draft);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Reattaches to a live draft and verifies that its immutable bases are still current.</summary>
    public async Task<CurationDraftSnapshot> GetAsync(string draftId, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var draft = FindLiveDraft(draftId);
            await EnsureCurrentBaseAsync(draft, cancellationToken);
            draft.LastAccessUtc = timeProvider.GetUtcNow();
            return Snapshot(draft);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Appends one command after revision and base checks, then atomically replaces replayed draft state.</summary>
    public async Task<CurationDraftSnapshot> AddLiteralMappingAsync(
        string draftId,
        AddLiteralMappingRequest request,
        CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var draft = FindLiveDraft(draftId);
            EnsureRevision(draft, request.ExpectedRevision);
            await EnsureCurrentBaseAsync(draft, cancellationToken);
            ValidatePredicate(request.PredicateId);

            var targetLabel = TargetTermLabel(draft.BaseState.Root, request.TargetTermId);
            var command = new StoredCommand(
                Guid.CreateVersion7(timeProvider.GetUtcNow()).ToString(),
                request.Selector,
                request.Literal,
                request.TargetTermId,
                targetLabel,
                request.PredicateId,
                $"urn:uuid:{Guid.CreateVersion7(timeProvider.GetUtcNow())}");
            var proposed = draft.Commands.Append(command).ToArray();
            var replay = Replay(draft, proposed, mappingDate: null);
            if (replay.Errors.Count > 0) throw new DraftValidationException(replay.Errors);

            draft.Commands.Clear();
            draft.Commands.AddRange(proposed);
            ApplyReplay(draft, replay);
            draft.Revision++;
            draft.LastAccessUtc = timeProvider.GetUtcNow();
            return Snapshot(draft);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Removes one command and rebuilds both artifacts from the immutable bases.</summary>
    public async Task<CurationDraftSnapshot> RemoveCommandAsync(
        string draftId,
        RemoveDraftCommandRequest request,
        CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var draft = FindLiveDraft(draftId);
            EnsureRevision(draft, request.ExpectedRevision);
            await EnsureCurrentBaseAsync(draft, cancellationToken);
            if (!draft.Commands.Any(command => command.Id == request.CommandId))
                throw new DraftOperationNotFoundException(draftId, request.CommandId);

            var proposed = draft.Commands.Where(command => command.Id != request.CommandId).ToArray();
            var replay = Replay(draft, proposed, mappingDate: null);
            if (replay.Errors.Count > 0) throw new DraftValidationException(replay.Errors);

            draft.Commands.Clear();
            draft.Commands.AddRange(proposed);
            ApplyReplay(draft, replay);
            draft.Revision++;
            draft.LastAccessUtc = timeProvider.GetUtcNow();
            return Snapshot(draft);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Discards one live draft without changing any workspace artifact.</summary>
    public async Task DiscardAsync(string draftId, long expectedRevision, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var draft = FindLiveDraft(draftId);
            EnsureRevision(draft, expectedRevision);
            drafts.Remove(draftId);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Builds the graph/table/term projection from current replayed ArcIR bytes.</summary>
    public async Task<GraphProjectionDto> GetProjectionAsync(string draftId, CancellationToken cancellationToken)
    {
        var materialized = await MaterializeAsync(draftId, cancellationToken);
        using var document = JsonDocument.Parse(materialized.ArcIrBytes);
        var state = new StateArtifact(
            materialized.Snapshot.StateId,
            materialized.Snapshot.StateId,
            "draft",
            "draft",
            materialized.Snapshot.ArcIrSha256,
            materialized.Snapshot.LastAccessUtc,
            materialized.ArcIrBytes,
            document);
        return projectionBuilder.Projection(state);
    }

    /// <summary>Builds complete inspector details from the current replayed draft ArcIR artifact.</summary>
    public async Task<ElementDetailDto?> GetDetailsAsync(
        string draftId,
        DetailRequest request,
        CancellationToken cancellationToken)
    {
        var materialized = await MaterializeAsync(draftId, cancellationToken);
        using var document = JsonDocument.Parse(materialized.ArcIrBytes);
        return projectionBuilder.Details(DraftArtifact(materialized, document), request);
    }

    /// <summary>Builds registered-term definition and occurrence details from replayed draft ArcIR.</summary>
    public async Task<TermDetailDto?> GetTermDetailsAsync(
        string draftId,
        TermDetailRequest request,
        CancellationToken cancellationToken)
    {
        var materialized = await MaterializeAsync(draftId, cancellationToken);
        using var document = JsonDocument.Parse(materialized.ArcIrBytes);
        return projectionBuilder.TermDetails(DraftArtifact(materialized, document), request);
    }

    /// <summary>Returns populated SSSOM metadata and records from the current replayed draft mapping artifact.</summary>
    public async Task<MappingsDto> GetMappingsAsync(string draftId, CancellationToken cancellationToken)
    {
        var materialized = await MaterializeAsync(draftId, cancellationToken);
        var document = sssomInterop.InspectDocument(materialized.SssomBytes);
        return new MappingsDto(
            materialized.Snapshot.StateId,
            materialized.Snapshot.Id,
            null,
            materialized.Snapshot.SssomSha256,
            true,
            document.Summary.SssomVersion,
            document.Summary.MappingSetId,
            document.Summary.License,
            document.MetadataFields,
            document.Mappings);
    }

    /// <summary>Returns exact replayed bytes for validated atomic save orchestration.</summary>
    internal async Task<DraftMaterialization> MaterializeAsync(string draftId, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var draft = FindLiveDraft(draftId);
            await EnsureCurrentBaseAsync(draft, cancellationToken);
            draft.LastAccessUtc = timeProvider.GetUtcNow();
            return new DraftMaterialization(Snapshot(draft), draft.CurrentArcIrBytes, draft.CurrentSssomBytes);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Locks one draft through final replay and an atomic save callback, clearing it only after success.</summary>
    internal async Task<T> ExecuteSaveAsync<T>(
        string draftId,
        long expectedRevision,
        DateTimeOffset saveUtc,
        Func<DraftSaveMaterialization, CancellationToken, Task<T>> save,
        CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var draft = FindLiveDraft(draftId);
            EnsureRevision(draft, expectedRevision);
            await EnsureCurrentBaseAsync(draft, cancellationToken);
            if (draft.Commands.Count == 0)
                throw new DraftValidationException(["An empty draft cannot be saved."]);

            var replay = Replay(draft, draft.Commands, DateOnly.FromDateTime(saveUtc.UtcDateTime));
            if (replay.Errors.Count > 0) throw new DraftValidationException(replay.Errors);
            var snapshot = Snapshot(draft, replay.ArcIrBytes!, replay.SssomBytes!, replay.Commands, saveUtc);
            var result = await save(
                new DraftSaveMaterialization(draft.BaseState, snapshot, replay.ArcIrBytes!, replay.SssomBytes!),
                cancellationToken);
            drafts.Remove(draftId);
            return result;
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Replays commands in order from immutable bases using only core-library adapters.</summary>
    private ReplayResult Replay(DraftState draft, IReadOnlyList<StoredCommand> commands, DateOnly? mappingDate)
    {
        var arcIrBytes = draft.BaseState.Bytes;
        var sssomBytes = draft.BaseState.MappingArtifact!.Bytes;
        var summaries = new List<DraftCommandSummary>();
        foreach (var command in commands)
        {
            var arc = arcIrInterop.ApplyLiteralMapping(arcIrBytes, command.Selector, command.Literal, command.TargetTermId);
            if (!arc.IsSuccess)
                return ReplayResult.Failed(command.Id, arc.Errors);

            var mapping = sssomInterop.ApplyLiteralMapping(
                sssomBytes,
                command.Literal,
                command.TargetTermId,
                command.TargetTermLabel,
                command.PredicateId,
                command.ProposedRecordId,
                mappingDate);
            if (!mapping.IsSuccess)
                return ReplayResult.Failed(command.Id, mapping.Errors);

            arcIrBytes = arc.Bytes!;
            sssomBytes = mapping.Bytes!;
            summaries.Add(new DraftCommandSummary(
                command.Id,
                command.Selector,
                command.Literal,
                command.TargetTermId,
                command.TargetTermLabel,
                command.PredicateId,
                command.ProposedRecordId,
                arc.OutputSelector!,
                arc.Status!,
                mapping.Created,
                mapping.Record!));
        }

        return new ReplayResult(arcIrBytes, sssomBytes, summaries, []);
    }

    /// <summary>Atomically replaces the derived bytes and command accounting after successful replay.</summary>
    private static void ApplyReplay(DraftState draft, ReplayResult replay)
    {
        draft.CurrentArcIrBytes = replay.ArcIrBytes!;
        draft.CurrentSssomBytes = replay.SssomBytes!;
        draft.CommandSummaries = replay.Commands;
    }

    /// <summary>Finds one draft after globally pruning entries inactive for at least twenty-four hours.</summary>
    private DraftState FindLiveDraft(string draftId)
    {
        var now = timeProvider.GetUtcNow();
        RemoveExpired(now);
        return drafts.TryGetValue(draftId, out var draft) ? draft : throw new DraftNotFoundException(draftId);
    }

    /// <summary>Removes expired drafts according to server-observed inactivity.</summary>
    private void RemoveExpired(DateTimeOffset now)
    {
        foreach (var id in drafts
                     .Where(pair => now - pair.Value.LastAccessUtc >= InactivityLifetime)
                     .Select(pair => pair.Key)
                     .ToArray())
            drafts.Remove(id);
    }

    /// <summary>Rejects a stale expected revision before performing command replay.</summary>
    private static void EnsureRevision(DraftState draft, long expectedRevision)
    {
        if (expectedRevision != draft.Revision)
            throw new DraftConflictException(
                $"Draft revision {expectedRevision} is stale; current revision is {draft.Revision}.");
    }

    /// <summary>Refreshes native discovery so external base or lineage changes invalidate the draft.</summary>
    private async Task EnsureCurrentBaseAsync(DraftState draft, CancellationToken cancellationToken)
    {
        if (!await workspace.MatchesCurrentBaseAsync(
                draft.StateId,
                draft.BaseState.Sha256,
                draft.BaseState.MappingArtifact!.Sha256,
                cancellationToken))
            throw new DraftConflictException("The draft's immutable ArcIR or SSSOM base is no longer current.");
    }

    /// <summary>Rejects predicates outside the first workflow's closed SKOS choice set.</summary>
    private static void ValidatePredicate(string predicateId)
    {
        if (!SupportedPredicates.Contains(predicateId))
            throw new DraftValidationException([$"Unsupported mapping predicate '{predicateId}'."]);
    }

    /// <summary>Reads the authoritative registered target label from the immutable ArcIR term dictionary.</summary>
    private static string TargetTermLabel(JsonElement root, string targetTermId)
    {
        var terms = root.GetProperty("graph").GetProperty("terms");
        if (!terms.TryGetProperty(targetTermId, out var term))
            throw new DraftValidationException([$"Target term '{targetTermId}' is not registered in the selected ArcIR state."]);
        return term.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String
            ? name.GetString()!
            : targetTermId;
    }

    /// <summary>Wraps replayed ArcIR bytes in a projection artifact whose JSON lifetime is owned by the caller.</summary>
    private static StateArtifact DraftArtifact(DraftMaterialization materialized, JsonDocument document) =>
        new(
            materialized.Snapshot.StateId,
            materialized.Snapshot.StateId,
            "draft",
            "draft",
            materialized.Snapshot.ArcIrSha256,
            materialized.Snapshot.LastAccessUtc,
            materialized.ArcIrBytes,
            document);

    /// <summary>Projects mutable server state into an immutable ordinary C# snapshot.</summary>
    private static CurationDraftSnapshot Snapshot(DraftState draft) =>
        Snapshot(
            draft,
            draft.CurrentArcIrBytes,
            draft.CurrentSssomBytes,
            draft.CommandSummaries,
            draft.LastAccessUtc);

    /// <summary>Projects supplied replay bytes into a save-time snapshot without mutating the live draft.</summary>
    private static CurationDraftSnapshot Snapshot(
        DraftState draft,
        byte[] arcIrBytes,
        byte[] sssomBytes,
        IReadOnlyList<DraftCommandSummary> commands,
        DateTimeOffset lastAccessUtc) =>
        new(
            draft.Id,
            draft.StateId,
            draft.Revision,
            draft.ProcessName,
            draft.Curator,
            draft.CreatedUtc,
            lastAccessUtc,
            draft.BaseState.Sha256,
            draft.BaseState.MappingArtifact!.Sha256,
            Sha256(arcIrBytes),
            Sha256(sssomBytes),
            commands);

    /// <summary>Computes a lowercase SHA-256 digest for replay-equivalence accounting.</summary>
    private static string Sha256(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    /// <summary>Releases the draft synchronization primitive; in-memory drafts intentionally do not persist.</summary>
    public void Dispose() => gate.Dispose();

    /// <summary>Mutable state confined to the synchronized server-owned draft store.</summary>
    private sealed class DraftState(
        string id,
        StateArtifact baseState,
        string curator,
        string processName,
        DateTimeOffset createdUtc)
    {
        internal string Id { get; } = id;
        internal string StateId { get; } = baseState.Id;
        internal StateArtifact BaseState { get; } = baseState;
        internal string Curator { get; } = curator;
        internal string ProcessName { get; } = processName;
        internal DateTimeOffset CreatedUtc { get; } = createdUtc;
        internal DateTimeOffset LastAccessUtc { get; set; } = createdUtc;
        internal long Revision { get; set; }
        internal List<StoredCommand> Commands { get; } = [];
        internal byte[] CurrentArcIrBytes { get; set; } = baseState.Bytes;
        internal byte[] CurrentSssomBytes { get; set; } = baseState.MappingArtifact!.Bytes;
        internal IReadOnlyList<DraftCommandSummary> CommandSummaries { get; set; } = [];
    }

    /// <summary>Stable typed command retained for deterministic replay and undo.</summary>
    private sealed record StoredCommand(
        string Id,
        string Selector,
        string Literal,
        string TargetTermId,
        string TargetTermLabel,
        string PredicateId,
        string ProposedRecordId);

    /// <summary>Internal all-or-nothing result of replaying an ordered command list.</summary>
    private sealed record ReplayResult(
        byte[]? ArcIrBytes,
        byte[]? SssomBytes,
        IReadOnlyList<DraftCommandSummary> Commands,
        IReadOnlyList<string> Errors)
    {
        internal static ReplayResult Failed(string commandId, IReadOnlyList<string> errors) =>
            new(null, null, [], errors.Select(error => $"Command '{commandId}': {error}").ToArray());
    }
}

/// <summary>Internal validated draft artifacts and metadata consumed by the save transaction.</summary>
internal sealed record DraftMaterialization(CurationDraftSnapshot Snapshot, byte[] ArcIrBytes, byte[] SssomBytes);

/// <summary>Save-time replay plus the exact immutable native base artifacts.</summary>
internal sealed record DraftSaveMaterialization(
    StateArtifact BaseState,
    CurationDraftSnapshot Snapshot,
    byte[] ArcIrBytes,
    byte[] SssomBytes);
