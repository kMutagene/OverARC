using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace OverARC.Api;

/// <summary>Signals invalid viewer configuration that prevents the workspace itself from loading.</summary>
public sealed class WorkspaceException(string message) : Exception(message);

/// <summary>Signals that a listed state exists but failed digest, codec, or structural validation.</summary>
public sealed class InvalidStateException(string stateId, IReadOnlyList<string> errors)
    : Exception($"State '{stateId}' is invalid: {string.Join("; ", errors)}")
{
    /// <summary>Gets the manifest state ID that failed validation.</summary>
    public string StateId { get; } = stateId;

    /// <summary>Gets every validation error retained for the state.</summary>
    public IReadOnlyList<string> Errors { get; } = errors;
}

/// <summary>Signals that a browseable state has no valid unambiguous SSSOM artifact to display or edit.</summary>
public sealed class MappingUnavailableException(string stateId, IReadOnlyList<string> errors)
    : Exception($"Mappings for state '{stateId}' are unavailable: {string.Join("; ", errors)}")
{
    /// <summary>Gets every mapping discovery or editability finding for the selected state.</summary>
    public IReadOnlyList<string> Errors { get; } = errors;
}

/// <summary>Models the application-owned viewer manifest after strict JSON deserialization.</summary>
internal sealed record ViewerManifest(string FormatVersion, string Name, IReadOnlyList<ManifestState> States);

/// <summary>Models one immutable ArcIR file binding from the viewer manifest.</summary>
internal sealed record ManifestState(string Id, string Label, string Path, string Sha256);

/// <summary>Defines one read-only workspace discovery strategy selected by authoritative files on disk.</summary>
internal interface IWorkspaceProvider
{
    /// <summary>Loads an immutable workspace snapshot without changing workspace bytes.</summary>
    Task<WorkspaceSnapshot> LoadAsync(CancellationToken cancellationToken);
}

/// <summary>Owns one validated SSSOM artifact paired with a native ArcIR state.</summary>
public sealed class MappingArtifact(
    string relativePath,
    string fullPath,
    string sha256,
    byte[] bytes,
    SssomDocumentSummary summary)
{
    /// <summary>Gets the ProcessCore-declared path relative to the workspace.</summary>
    public string RelativePath { get; } = relativePath;

    /// <summary>Gets the safely resolved absolute artifact path.</summary>
    public string FullPath { get; } = fullPath;

    /// <summary>Gets the verified lowercase SHA-256 digest.</summary>
    public string Sha256 { get; } = sha256;

    /// <summary>Gets the exact immutable artifact bytes retained for draft replay.</summary>
    public byte[] Bytes { get; } = bytes;

    /// <summary>Gets transport-neutral metadata decoded by PolyglotSSSOM.</summary>
    public SssomDocumentSummary Summary { get; } = summary;
}

/// <summary>Owns one validated ArcIR JSON document and the manifest metadata used to project it.</summary>
public sealed class StateArtifact(
    string id,
    string label,
    string relativePath,
    string fullPath,
    string sha256,
    DateTimeOffset lastWriteUtc,
    byte[] bytes,
    JsonDocument document,
    MappingArtifact? mappingArtifact = null)
{
    /// <summary>Gets the URL-safe state ID assigned by the viewer manifest.</summary>
    public string Id { get; } = id;

    /// <summary>Gets the curator-facing state label assigned by the viewer manifest.</summary>
    public string Label { get; } = label;

    /// <summary>Gets the manifest path relative to the workspace root.</summary>
    public string RelativePath { get; } = relativePath;

    /// <summary>Gets the fully resolved, workspace-contained state path.</summary>
    public string FullPath { get; } = fullPath;

    /// <summary>Gets the lowercase SHA-256 digest that binds the state to immutable bytes.</summary>
    public string Sha256 { get; } = sha256;

    /// <summary>Gets the filesystem timestamp used only for the initial-view convenience choice.</summary>
    public DateTimeOffset LastWriteUtc { get; } = lastWriteUtc;

    /// <summary>Gets the exact immutable ArcIR bytes retained for draft replay and digest checks.</summary>
    public byte[] Bytes { get; } = bytes;

    /// <summary>Gets the root of the validated ArcIR JSON document.</summary>
    public JsonElement Root => Document.RootElement;

    /// <summary>Gets the owned JSON document; its lifetime is controlled by the workspace snapshot.</summary>
    public JsonDocument Document { get; } = document;

    /// <summary>Gets the validated native SSSOM base when this state is editable.</summary>
    public MappingArtifact? MappingArtifact { get; } = mappingArtifact;
}

/// <summary>Groups one workspace response with the validated artifacts addressable through it.</summary>
internal sealed record WorkspaceSnapshot(WorkspaceDto Dto, IReadOnlyDictionary<string, StateArtifact> ValidStates) : IDisposable
{
    /// <summary>Releases all JSON documents owned by this immutable snapshot.</summary>
    public void Dispose()
    {
        foreach (var state in ValidStates.Values) state.Document.Dispose();
    }
}

/// <summary>Caches immutable bytes and their ArcIR validation result by resolved path and digest.</summary>
internal sealed record StateCacheEntry(byte[] Bytes, IReadOnlyList<string> ValidationErrors);

/// <summary>Caches immutable SSSOM bytes, validation errors, and decoded metadata by path and digest.</summary>
internal sealed record MappingCacheEntry(byte[] Bytes, IReadOnlyList<string> ValidationErrors, SssomDocumentSummary? Summary);

/// <summary>Loads, validates, caches, and serves the read-only viewer workspace.</summary>
public sealed class WorkspaceService : IDisposable
{
    private const string ManifestRelativePath = ".overarc/viewer.json";
    private const string NativeArcRelativePath = "arc.yml";
    private const string ArcIrArtifactType = "ArcIR state";
    private const string SssomArtifactType = "SSSOM mapping set";
    private static readonly Regex StateIdPattern = new("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$", RegexOptions.CultureInvariant);
    private static readonly Regex Sha256Pattern = new("^[a-f0-9]{64}$", RegexOptions.CultureInvariant);
    private static readonly JsonSerializerOptions ManifestJson = new()
    {
        PropertyNameCaseInsensitive = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };

    private readonly string workspaceRoot;
    private readonly ArcIrInteropAdapter interop;
    private readonly SssomInteropAdapter sssomInterop;
    private readonly ProcessCoreInteropAdapter processCoreInterop;
    private readonly GraphProjectionBuilder projectionBuilder;
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly Dictionary<string, StateCacheEntry> stateCache = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, MappingCacheEntry> mappingCache = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<WorkspaceSnapshot> retiredSnapshots = [];
    private WorkspaceSnapshot? snapshot;

    /// <summary>Creates a workspace service rooted at an explicitly configured local directory with all core adapters.</summary>
    public WorkspaceService(
        string workspaceRoot,
        ArcIrInteropAdapter interop,
        SssomInteropAdapter sssomInterop,
        ProcessCoreInteropAdapter processCoreInterop,
        GraphProjectionBuilder projectionBuilder)
    {
        this.workspaceRoot = Path.GetFullPath(workspaceRoot);
        this.interop = interop;
        this.sssomInterop = sssomInterop;
        this.processCoreInterop = processCoreInterop;
        this.projectionBuilder = projectionBuilder;
    }

    /// <summary>Creates a compatibility service for callers that only supplied the original read-only dependencies.</summary>
    public WorkspaceService(string workspaceRoot, ArcIrInteropAdapter interop, GraphProjectionBuilder projectionBuilder)
        : this(workspaceRoot, interop, new SssomInteropAdapter(), new ProcessCoreInteropAdapter(), projectionBuilder)
    {
    }

    /// <summary>Returns the current workspace metadata, loading the first immutable snapshot lazily.</summary>
    public async Task<WorkspaceDto> GetWorkspaceAsync(CancellationToken cancellationToken) =>
        (await EnsureSnapshotAsync(cancellationToken)).Dto;

    /// <summary>Re-reads and revalidates the workspace without writing its manifest or state files.</summary>
    public async Task<WorkspaceDto> RefreshAsync(CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var replacement = await LoadAsync(cancellationToken);
            var previous = snapshot;
            snapshot = replacement;
            // In-flight projection/detail calls may still hold an artifact from the
            // previous immutable snapshot. Retire it until service shutdown.
            if (previous is not null) retiredSnapshots.Add(previous);
            return replacement.Dto;
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Builds the compact graph projection for one valid state selected by exact state ID.</summary>
    public async Task<GraphProjectionDto> GetProjectionAsync(string stateId, CancellationToken cancellationToken)
    {
        var state = await GetStateAsync(stateId, cancellationToken);
        return projectionBuilder.Projection(state);
    }

    /// <summary>Builds complete inspector details for one exact object or relation in a valid state.</summary>
    public async Task<ElementDetailDto?> GetDetailsAsync(string stateId, DetailRequest request, CancellationToken cancellationToken)
    {
        var state = await GetStateAsync(stateId, cancellationToken);
        return projectionBuilder.Details(state, request);
    }

    /// <summary>Builds complete definition and occurrence details for one exact term in a valid state.</summary>
    public async Task<TermDetailDto?> GetTermDetailsAsync(string stateId, TermDetailRequest request, CancellationToken cancellationToken)
    {
        var state = await GetStateAsync(stateId, cancellationToken);
        return projectionBuilder.TermDetails(state, request);
    }

    /// <summary>Returns validated SSSOM metadata and populated records paired to one editable native state.</summary>
    public async Task<MappingsDto> GetMappingsAsync(string stateId, CancellationToken cancellationToken)
    {
        var state = await GetStateAsync(stateId, cancellationToken);
        if (state.MappingArtifact is null)
        {
            var summary = (await EnsureSnapshotAsync(cancellationToken)).Dto.States.Single(item => item.Id == stateId);
            throw new MappingUnavailableException(
                stateId,
                summary.CurationErrors is { Count: > 0 }
                    ? summary.CurationErrors
                    : ["The selected state has no valid unambiguous SSSOM 1.1 artifact."]);
        }

        var document = sssomInterop.InspectDocument(state.MappingArtifact.Bytes);
        return new MappingsDto(
            state.Id,
            null,
            state.MappingArtifact.RelativePath,
            state.MappingArtifact.Sha256,
            false,
            document.Summary.SssomVersion,
            document.Summary.MappingSetId,
            document.Summary.License,
            document.MetadataFields,
            document.Mappings);
    }

    /// <summary>Returns the immutable validated base artifact used by server-side draft orchestration.</summary>
    internal Task<StateArtifact> GetStateArtifactAsync(string stateId, CancellationToken cancellationToken) =>
        GetStateAsync(stateId, cancellationToken);

    /// <summary>Safely resolves an application-planned artifact path for create-new publication.</summary>
    internal string ResolveArtifactPathForWrite(string relativePath) =>
        ResolveSafeArtifactPath(relativePath, "Publication artifact");

    /// <summary>Refreshes discovery and verifies that a draft's exact ArcIR and SSSOM bases remain current.</summary>
    internal async Task<bool> MatchesCurrentBaseAsync(
        string stateId,
        string arcIrSha256,
        string sssomSha256,
        CancellationToken cancellationToken)
    {
        await RefreshAsync(cancellationToken);
        if (snapshot is null || !snapshot.ValidStates.TryGetValue(stateId, out var state)) return false;
        return string.Equals(state.Sha256, arcIrSha256, StringComparison.Ordinal)
               && string.Equals(state.MappingArtifact?.Sha256, sssomSha256, StringComparison.Ordinal);
    }

    /// <summary>Resolves a listed state or distinguishes unknown state IDs from known invalid entries.</summary>
    private async Task<StateArtifact> GetStateAsync(string stateId, CancellationToken cancellationToken)
    {
        var current = await EnsureSnapshotAsync(cancellationToken);
        if (current.ValidStates.TryGetValue(stateId, out var state)) return state;

        var summary = current.Dto.States.FirstOrDefault(item => item.Id == stateId);
        if (summary is null) throw new KeyNotFoundException($"State '{stateId}' is not listed by this workspace.");
        throw new InvalidStateException(stateId, summary.Errors);
    }

    /// <summary>Returns the current snapshot, serializing only its lazy first load through the gate.</summary>
    private async Task<WorkspaceSnapshot> EnsureSnapshotAsync(CancellationToken cancellationToken)
    {
        if (snapshot is not null) return snapshot;
        await gate.WaitAsync(cancellationToken);
        try
        {
            snapshot ??= await LoadAsync(cancellationToken);
            return snapshot;
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Selects native ARC discovery when arc.yml exists, otherwise retaining legacy manifest discovery.</summary>
    private async Task<WorkspaceSnapshot> LoadAsync(CancellationToken cancellationToken)
    {
        IWorkspaceProvider provider = File.Exists(Path.Combine(workspaceRoot, NativeArcRelativePath))
            ? new NativeArcWorkspaceProvider(this)
            : new LegacyManifestWorkspaceProvider(this);
        return await provider.LoadAsync(cancellationToken);
    }

    /// <summary>Strictly loads the legacy manifest and validates each state independently into a replacement snapshot.</summary>
    private async Task<WorkspaceSnapshot> LoadLegacyAsync(CancellationToken cancellationToken)
    {
        var manifestPath = Path.Combine(workspaceRoot, ".overarc", "viewer.json");
        if (!File.Exists(manifestPath)) throw new WorkspaceException($"Required viewer manifest '{manifestPath}' does not exist.");

        ViewerManifest manifest;
        try
        {
            await using var stream = File.OpenRead(manifestPath);
            manifest = await JsonSerializer.DeserializeAsync<ViewerManifest>(stream, ManifestJson, cancellationToken)
                       ?? throw new WorkspaceException("The viewer manifest is empty.");
        }
        catch (JsonException error)
        {
            throw new WorkspaceException($"The viewer manifest is invalid: {error.Message}");
        }

        ValidateManifest(manifest);
        var summaries = new List<StateSummaryDto>();
        var validStates = new Dictionary<string, StateArtifact>(StringComparer.Ordinal);

        foreach (var entry in manifest.States)
        {
            var loaded = await LoadStateAsync(entry, cancellationToken);
            summaries.Add(loaded.Summary);
            if (loaded.Artifact is not null) validStates.Add(entry.Id, loaded.Artifact);
        }

        var defaultStateId = validStates.Values
            .OrderByDescending(state => state.LastWriteUtc)
            .ThenBy(state => state.Id, StringComparer.Ordinal)
            .Select(state => state.Id)
            .FirstOrDefault();

        return new WorkspaceSnapshot(
            new WorkspaceDto(manifest.Name, ManifestRelativePath, defaultStateId, summaries),
            validStates);
    }

    /// <summary>Validates one state path, digest, ArcIR document, and graph counts without affecting sibling entries.</summary>
    private async Task<(StateSummaryDto Summary, StateArtifact? Artifact)> LoadStateAsync(ManifestState entry, CancellationToken cancellationToken)
    {
        string fullPath;
        try
        {
            fullPath = ResolveSafeArtifactPath(entry.Path, "State");
        }
        catch (WorkspaceException error)
        {
            return (Summary(entry, "invalidPath", null, null, null, null, [error.Message]), null);
        }

        if (!File.Exists(fullPath))
            return (Summary(entry, "missing", null, null, null, null, [$"State file '{entry.Path}' does not exist."]), null);

        var lastWrite = File.GetLastWriteTimeUtc(fullPath);
        var bytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
        var actualDigest = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        if (!string.Equals(actualDigest, entry.Sha256, StringComparison.Ordinal))
            return (Summary(entry, "digestMismatch", lastWrite, null, null, null,
                [$"Expected SHA-256 {entry.Sha256}, but found {actualDigest}."]), null);

        var cacheKey = fullPath + "\n" + actualDigest;
        if (!stateCache.TryGetValue(cacheKey, out var cached))
        {
            cached = new StateCacheEntry(bytes, interop.Validate(bytes));
            stateCache.Add(cacheKey, cached);
        }

        var validationErrors = cached.ValidationErrors;
        if (validationErrors.Count > 0)
            return (Summary(entry, "invalid", lastWrite, null, null, null, validationErrors), null);

        var document = JsonDocument.Parse(cached.Bytes);
        var root = document.RootElement;
        var formatVersion = root.GetProperty("formatVersion").GetString();
        var graph = root.GetProperty("graph");
        var objectCount = graph.GetProperty("objects").EnumerateObject().Count();
        var relationCount = graph.GetProperty("relations").EnumerateObject().Count();
        var artifact = new StateArtifact(entry.Id, entry.Label, entry.Path, fullPath, entry.Sha256, lastWrite, cached.Bytes, document);
        return (Summary(entry, "valid", lastWrite, formatVersion, objectCount, relationCount, []), artifact);
    }

    /// <summary>Loads current ArcIR and SSSOM artifacts exclusively from ProcessCore-declared native lineage.</summary>
    private async Task<WorkspaceSnapshot> LoadNativeAsync(CancellationToken cancellationToken)
    {
        var arcPath = ResolveSafeArtifactPath(NativeArcRelativePath, "Native ARC");
        byte[] arcBytes;
        try
        {
            arcBytes = await File.ReadAllBytesAsync(arcPath, cancellationToken);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            throw new WorkspaceException($"Native ARC metadata '{NativeArcRelativePath}' could not be read: {error.Message}");
        }

        var arcErrors = processCoreInterop.Validate(arcBytes);
        if (arcErrors.Count > 0)
            throw new WorkspaceException($"Native ARC metadata is invalid: {string.Join("; ", arcErrors)}");

        NativeArcSummary native;
        try
        {
            native = processCoreInterop.Inspect(arcBytes);
        }
        catch (Exception error)
        {
            throw new WorkspaceException($"Native ARC metadata could not be inspected: {error.Message}");
        }

        var findings = new List<string>();
        var completeArtifacts = native.Artifacts
            .Where(artifact => artifact.Selector is null)
            .ToArray();
        var superseded = FindSupersededArtifacts(native.Processes);
        var currentArcIr = completeArtifacts
            .Where(artifact => artifact.ArtifactType == ArcIrArtifactType && !superseded.Contains(ArtifactKey(artifact)))
            .OrderBy(artifact => artifact.Path, StringComparer.Ordinal)
            .ToArray();
        var currentMappings = completeArtifacts
            .Where(artifact => artifact.ArtifactType == SssomArtifactType && !superseded.Contains(ArtifactKey(artifact)))
            .OrderBy(artifact => artifact.Path, StringComparer.Ordinal)
            .ToArray();

        if (currentArcIr.Length == 0)
            findings.Add("Native ARC lineage has no current complete ArcIR state artifact.");
        if (currentMappings.Length == 0)
            findings.Add("Native ARC lineage has no current complete SSSOM mapping artifact.");

        var lineageErrors = FindAmbiguousLineage(native.Processes);
        var mappingLoads = new Dictionary<string, NativeMappingLoad>(StringComparer.Ordinal);
        foreach (var mapping in currentMappings)
        {
            var loaded = await LoadNativeMappingAsync(mapping, cancellationToken);
            mappingLoads[ArtifactKey(mapping)] = loaded;
            foreach (var error in loaded.Summary.Errors)
                findings.Add($"SSSOM artifact '{mapping.Path}': {error}");
        }

        var summaries = new List<StateSummaryDto>();
        var validStates = new Dictionary<string, StateArtifact>(StringComparer.Ordinal);
        var usedIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var arcArtifact in currentArcIr)
        {
            var stateId = NativeStateId(arcArtifact, usedIds);
            var association = ResolveMappingAssociation(arcArtifact, currentMappings, native.Processes);
            NativeMappingLoad? mapping = null;
            if (association.Artifact is not null)
                mappingLoads.TryGetValue(ArtifactKey(association.Artifact), out mapping);

            var curationErrors = new List<string>();
            curationErrors.AddRange(association.Errors);
            if (lineageErrors.TryGetValue(ArtifactKey(arcArtifact), out var errors)) curationErrors.AddRange(errors);
            if (mapping is not null) curationErrors.AddRange(mapping.Summary.Errors);

            var loaded = await LoadNativeStateAsync(stateId, arcArtifact, mapping, curationErrors, cancellationToken);
            summaries.Add(loaded.Summary);
            if (loaded.Artifact is not null) validStates.Add(stateId, loaded.Artifact);
        }

        var defaultStateId = validStates.Count == 1 ? validStates.Keys.Single() : null;
        return new WorkspaceSnapshot(
            new WorkspaceDto(
                native.Title ?? native.Identifier,
                NativeArcRelativePath,
                defaultStateId,
                summaries,
                "nativeArc",
                findings),
            validStates);
    }

    /// <summary>Loads and validates one native ArcIR artifact while preserving mapping failures as editability findings.</summary>
    private async Task<(StateSummaryDto Summary, StateArtifact? Artifact)> LoadNativeStateAsync(
        string stateId,
        NativeArcArtifact entry,
        NativeMappingLoad? mapping,
        IReadOnlyList<string> curationErrors,
        CancellationToken cancellationToken)
    {
        var label = NativeStateLabel(entry.Path);
        var mappingSummary = mapping?.Summary;
        var declaredDigest = entry.Sha256;
        if (!Sha256Pattern.IsMatch(declaredDigest ?? string.Empty))
            return (NativeStateSummary(stateId, label, entry, "invalid", null, null, null, null,
                ["The native ArcIR artifact requires a lowercase SHA-256 annotation."], false, mappingSummary, curationErrors), null);

        string fullPath;
        try
        {
            fullPath = ResolveSafeArtifactPath(entry.Path, "ArcIR artifact");
        }
        catch (WorkspaceException error)
        {
            return (NativeStateSummary(stateId, label, entry, "invalidPath", null, null, null, null,
                [error.Message], false, mappingSummary, curationErrors), null);
        }

        if (!File.Exists(fullPath))
            return (NativeStateSummary(stateId, label, entry, "missing", null, null, null, null,
                [$"ArcIR artifact '{entry.Path}' does not exist."], false, mappingSummary, curationErrors), null);

        var lastWrite = File.GetLastWriteTimeUtc(fullPath);
        var bytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
        var actualDigest = Sha256(bytes);
        if (!string.Equals(actualDigest, declaredDigest, StringComparison.Ordinal))
            return (NativeStateSummary(stateId, label, entry, "digestMismatch", lastWrite, null, null, null,
                [$"Expected SHA-256 {declaredDigest}, but found {actualDigest}."], false, mappingSummary, curationErrors), null);

        var cacheKey = fullPath + "\n" + actualDigest;
        if (!stateCache.TryGetValue(cacheKey, out var cached))
        {
            cached = new StateCacheEntry(bytes, interop.ValidateForEditing(bytes));
            stateCache.Add(cacheKey, cached);
        }

        if (cached.ValidationErrors.Count > 0)
            return (NativeStateSummary(stateId, label, entry, "invalid", lastWrite, null, null, null,
                cached.ValidationErrors, false, mappingSummary, curationErrors), null);

        var document = JsonDocument.Parse(cached.Bytes);
        var root = document.RootElement;
        var graph = root.GetProperty("graph");
        var editable = mapping?.Artifact is not null && curationErrors.Count == 0;
        var artifact = new StateArtifact(
            stateId,
            label,
            entry.Path,
            fullPath,
            actualDigest,
            lastWrite,
            cached.Bytes,
            document,
            editable ? mapping!.Artifact : null);
        return (NativeStateSummary(
            stateId,
            label,
            entry,
            "valid",
            lastWrite,
            root.GetProperty("formatVersion").GetString(),
            graph.GetProperty("objects").EnumerateObject().Count(),
            graph.GetProperty("relations").EnumerateObject().Count(),
            [],
            editable,
            mappingSummary,
            curationErrors), artifact);
    }

    /// <summary>Loads and validates one current native SSSOM artifact independently of sibling artifacts.</summary>
    private async Task<NativeMappingLoad> LoadNativeMappingAsync(NativeArcArtifact entry, CancellationToken cancellationToken)
    {
        var errors = new List<string>();
        if (!Sha256Pattern.IsMatch(entry.Sha256 ?? string.Empty))
        {
            errors.Add("The native SSSOM artifact requires a lowercase SHA-256 annotation.");
            return NativeMappingLoad.Invalid(entry, "invalid", errors);
        }

        string fullPath;
        try
        {
            fullPath = ResolveSafeArtifactPath(entry.Path, "SSSOM artifact");
        }
        catch (WorkspaceException error)
        {
            errors.Add(error.Message);
            return NativeMappingLoad.Invalid(entry, "invalidPath", errors);
        }

        if (!File.Exists(fullPath))
        {
            errors.Add($"SSSOM artifact '{entry.Path}' does not exist.");
            return NativeMappingLoad.Invalid(entry, "missing", errors);
        }

        var bytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
        var actualDigest = Sha256(bytes);
        if (!string.Equals(actualDigest, entry.Sha256, StringComparison.Ordinal))
        {
            errors.Add($"Expected SHA-256 {entry.Sha256}, but found {actualDigest}.");
            return NativeMappingLoad.Invalid(entry, "digestMismatch", errors);
        }

        var cacheKey = fullPath + "\n" + actualDigest;
        if (!mappingCache.TryGetValue(cacheKey, out var cached))
        {
            var validationErrors = sssomInterop.Validate(bytes);
            SssomDocumentSummary? summary = null;
            if (validationErrors.Count == 0)
            {
                try
                {
                    summary = sssomInterop.Inspect(bytes);
                }
                catch (Exception error)
                {
                    validationErrors = [$"SSSOM_INSPECTION: {error.Message}"];
                }
            }

            cached = new MappingCacheEntry(bytes, validationErrors, summary);
            mappingCache.Add(cacheKey, cached);
        }

        errors.AddRange(cached.ValidationErrors);
        if (cached.Summary is not null && cached.Summary.SssomVersion != "1.1")
            errors.Add("Edit-enabled mapping artifacts must explicitly declare SSSOM 1.1.");

        var status = errors.Count == 0 ? "valid" : "invalid";
        var dto = new MappingArtifactSummaryDto(
            entry.Path,
            entry.Sha256,
            status,
            cached.Summary?.SssomVersion,
            cached.Summary?.MappingSetId,
            cached.Summary?.MappingCount,
            errors);
        var artifact = errors.Count == 0 && cached.Summary is not null
            ? new MappingArtifact(entry.Path, fullPath, actualDigest, cached.Bytes, cached.Summary)
            : null;
        return new NativeMappingLoad(dto, artifact);
    }

    /// <summary>Finds complete artifacts consumed by an explicit same-kind predecessor/successor process lane.</summary>
    private static HashSet<string> FindSupersededArtifacts(IReadOnlyList<NativeArcProcess> processes)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        foreach (var process in processes)
        {
            var input = process.Input;
            var output = process.Output;
            if (input is not null
                && output is not null
                && input.Selector is null
                && output.Selector is null
                && input.ArtifactType is ArcIrArtifactType or SssomArtifactType
                && input.ArtifactType == output.ArtifactType
                && ArtifactKey(input) != ArtifactKey(output))
                result.Add(ArtifactKey(input));
        }

        return result;
    }

    /// <summary>Reports branch or merge lineage that cannot designate one authoritative successor chain.</summary>
    private static IReadOnlyDictionary<string, IReadOnlyList<string>> FindAmbiguousLineage(IReadOnlyList<NativeArcProcess> processes)
    {
        var edges = processes
            .Where(process => process.Input is not null
                              && process.Output is not null
                              && process.Input.Selector is null
                              && process.Output.Selector is null
                              && process.Input.ArtifactType is ArcIrArtifactType or SssomArtifactType
                              && process.Input.ArtifactType == process.Output.ArtifactType
                              && ArtifactKey(process.Input) != ArtifactKey(process.Output))
            .Select(process => (Input: ArtifactKey(process.Input!), Output: ArtifactKey(process.Output!)))
            .Distinct()
            .ToArray();
        var result = new Dictionary<string, List<string>>(StringComparer.Ordinal);

        foreach (var branch in edges.GroupBy(edge => edge.Input).Where(group => group.Select(edge => edge.Output).Distinct().Count() > 1))
            foreach (var output in branch.Select(edge => edge.Output).Distinct())
                AddLineageError(result, output, $"Artifact lineage branches from '{branch.Key}'.");

        foreach (var merge in edges.GroupBy(edge => edge.Output).Where(group => group.Select(edge => edge.Input).Distinct().Count() > 1))
            AddLineageError(result, merge.Key, "Artifact lineage merges multiple complete predecessors.");

        return result.ToDictionary(pair => pair.Key, pair => (IReadOnlyList<string>)pair.Value, StringComparer.Ordinal);
    }

    /// <summary>Associates a current ArcIR state with the SSSOM artifact participating in the same native process group.</summary>
    private static MappingAssociation ResolveMappingAssociation(
        NativeArcArtifact arcArtifact,
        IReadOnlyList<NativeArcArtifact> currentMappings,
        IReadOnlyList<NativeArcProcess> processes)
    {
        var producerNames = processes
            .Where(process => process.Output is not null && ArtifactKey(process.Output) == ArtifactKey(arcArtifact))
            .Select(process => process.Name)
            .ToHashSet(StringComparer.Ordinal);
        var linked = currentMappings
            .Where(mapping => processes.Any(process =>
                producerNames.Contains(process.Name)
                && (process.Input?.Path == mapping.Path || process.Output?.Path == mapping.Path)))
            .ToArray();

        if (linked.Length == 1) return new MappingAssociation(linked[0], []);
        if (linked.Length > 1)
            return new MappingAssociation(null, ["Native lineage associates this ArcIR state with multiple current SSSOM artifacts."]);
        if (currentMappings.Count == 1) return new MappingAssociation(currentMappings[0], []);
        if (currentMappings.Count == 0)
            return new MappingAssociation(null, ["No current SSSOM mapping artifact is available for this state."]);
        return new MappingAssociation(null, ["Native lineage does not unambiguously associate this ArcIR state with a current SSSOM artifact."]);
    }

    /// <summary>Builds one deterministic URL-safe state ID from native artifact identity.</summary>
    private static string NativeStateId(NativeArcArtifact artifact, ISet<string> usedIds)
    {
        var id = NativeStateLabel(artifact.Path);
        id = Regex.Replace(id, "[^A-Za-z0-9._-]+", "-", RegexOptions.CultureInvariant).Trim('-', '.', '_');
        if (string.IsNullOrEmpty(id) || !char.IsLetterOrDigit(id[0])) id = "state-" + id;
        if (id.Length > 96) id = id[..96];
        if (usedIds.Add(id)) return id;

        var suffix = Sha256(Encoding.UTF8.GetBytes(artifact.Path))[..12];
        var disambiguated = $"{id}-{suffix}";
        usedIds.Add(disambiguated);
        return disambiguated;
    }

    /// <summary>Returns a curator-facing native state label from the artifact filename.</summary>
    private static string NativeStateLabel(string path)
    {
        var name = path.Replace('\\', '/').Split('/').LastOrDefault() ?? path;
        return name.EndsWith(".arcir.json", StringComparison.OrdinalIgnoreCase)
            ? name[..^".arcir.json".Length]
            : Path.GetFileNameWithoutExtension(name);
    }

    /// <summary>Creates a native state summary without conflating ArcIR validity and editability.</summary>
    private static StateSummaryDto NativeStateSummary(
        string id,
        string label,
        NativeArcArtifact artifact,
        string status,
        DateTimeOffset? lastWrite,
        string? formatVersion,
        int? objects,
        int? relations,
        IReadOnlyList<string> errors,
        bool editable,
        MappingArtifactSummaryDto? mapping,
        IReadOnlyList<string> curationErrors) =>
        new(
            id,
            label,
            artifact.Path,
            artifact.Sha256 ?? string.Empty,
            status,
            lastWrite,
            formatVersion,
            objects,
            relations,
            errors,
            editable,
            mapping,
            curationErrors);

    /// <summary>Returns a stable complete-artifact identity independent of mutable filesystem metadata.</summary>
    private static string ArtifactKey(NativeArcArtifact artifact) =>
        artifact.Path + "\n" + (artifact.Selector ?? string.Empty);

    /// <summary>Adds one nonduplicated lineage finding to an artifact.</summary>
    private static void AddLineageError(Dictionary<string, List<string>> errors, string key, string message)
    {
        if (!errors.TryGetValue(key, out var messages)) errors.Add(key, messages = []);
        if (!messages.Contains(message, StringComparer.Ordinal)) messages.Add(message);
    }

    /// <summary>Computes the lowercase SHA-256 digest used by native and legacy immutable bindings.</summary>
    private static string Sha256(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    /// <summary>Resolves a relative artifact path while rejecting root escape and symbolic-link traversal.</summary>
    private string ResolveSafeArtifactPath(string relativePath, string artifactKind)
    {
        if (string.IsNullOrWhiteSpace(relativePath) || Path.IsPathRooted(relativePath))
            throw new WorkspaceException($"{artifactKind} paths must be non-empty paths relative to the workspace.");

        var candidate = Path.GetFullPath(Path.Combine(workspaceRoot, relativePath.Replace('/', Path.DirectorySeparatorChar)));
        var rootPrefix = workspaceRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
            throw new WorkspaceException($"{artifactKind} path '{relativePath}' escapes the workspace root.");

        var current = workspaceRoot;
        foreach (var segment in Path.GetRelativePath(workspaceRoot, candidate).Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
        {
            current = Path.Combine(current, segment);
            if ((File.Exists(current) || Directory.Exists(current))
                && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new WorkspaceException($"{artifactKind} path '{relativePath}' traverses a symbolic link or reparse point.");
        }

        return candidate;
    }

    /// <summary>Creates the common state-summary transport shape for valid and invalid entries.</summary>
    private static StateSummaryDto Summary(
        ManifestState state,
        string status,
        DateTimeOffset? lastWrite,
        string? formatVersion,
        int? objects,
        int? relations,
        IReadOnlyList<string> errors) =>
        new(state.Id, state.Label, state.Path, state.Sha256, status, lastWrite, formatVersion, objects, relations, errors);

    /// <summary>Enforces the supported manifest version, URL-safe unique IDs, labels, paths, and lowercase digests.</summary>
    private static void ValidateManifest(ViewerManifest manifest)
    {
        if (manifest.FormatVersion != "1.0") throw new WorkspaceException($"Unsupported viewer manifest version '{manifest.FormatVersion}'.");
        if (string.IsNullOrWhiteSpace(manifest.Name)) throw new WorkspaceException("The viewer manifest name is required.");
        if (manifest.States is null) throw new WorkspaceException("The viewer manifest states collection is required.");

        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var state in manifest.States)
        {
            var stateId = state.Id ?? string.Empty;
            if (!StateIdPattern.IsMatch(stateId))
                throw new WorkspaceException($"State ID '{state.Id}' is not URL-safe.");
            if (!ids.Add(stateId)) throw new WorkspaceException($"State ID '{state.Id}' is duplicated.");
            if (string.IsNullOrWhiteSpace(state.Label)) throw new WorkspaceException($"State '{state.Id}' requires a label.");
            if (string.IsNullOrWhiteSpace(state.Path)) throw new WorkspaceException($"State '{state.Id}' requires a relative path.");
            if (!Sha256Pattern.IsMatch(state.Sha256 ?? string.Empty))
                throw new WorkspaceException($"State '{state.Id}' requires a lowercase SHA-256 digest.");
        }
    }

    /// <summary>Pairs a mapping summary shown to clients with its optional validated immutable artifact.</summary>
    private sealed record NativeMappingLoad(MappingArtifactSummaryDto Summary, MappingArtifact? Artifact)
    {
        /// <summary>Creates an invalid mapping result before bytes can be decoded.</summary>
        internal static NativeMappingLoad Invalid(NativeArcArtifact artifact, string status, IReadOnlyList<string> errors) =>
            new(new MappingArtifactSummaryDto(artifact.Path, artifact.Sha256, status, null, null, null, errors), null);
    }

    /// <summary>Contains the native mapping paired to a state or actionable association failures.</summary>
    private sealed record MappingAssociation(NativeArcArtifact? Artifact, IReadOnlyList<string> Errors);

    /// <summary>Retains the original application-manifest provider for legacy read-only workspaces.</summary>
    private sealed class LegacyManifestWorkspaceProvider(WorkspaceService owner) : IWorkspaceProvider
    {
        /// <inheritdoc />
        public Task<WorkspaceSnapshot> LoadAsync(CancellationToken cancellationToken) => owner.LoadLegacyAsync(cancellationToken);
    }

    /// <summary>Uses ProcessCore arc.yml as the sole lineage authority for edit-capable workspaces.</summary>
    private sealed class NativeArcWorkspaceProvider(WorkspaceService owner) : IWorkspaceProvider
    {
        /// <inheritdoc />
        public Task<WorkspaceSnapshot> LoadAsync(CancellationToken cancellationToken) => owner.LoadNativeAsync(cancellationToken);
    }

    /// <summary>Releases active and retired immutable snapshots plus the synchronization gate.</summary>
    public void Dispose()
    {
        snapshot?.Dispose();
        foreach (var retired in retiredSnapshots) retired.Dispose();
        gate.Dispose();
    }
}
