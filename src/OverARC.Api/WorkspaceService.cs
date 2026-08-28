using System.Security.Cryptography;
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

/// <summary>Models the application-owned viewer manifest after strict JSON deserialization.</summary>
internal sealed record ViewerManifest(string FormatVersion, string Name, IReadOnlyList<ManifestState> States);

/// <summary>Models one immutable ArcIR file binding from the viewer manifest.</summary>
internal sealed record ManifestState(string Id, string Label, string Path, string Sha256);

/// <summary>Owns one validated ArcIR JSON document and the manifest metadata used to project it.</summary>
public sealed class StateArtifact(
    string id,
    string label,
    string relativePath,
    string fullPath,
    string sha256,
    DateTimeOffset lastWriteUtc,
    JsonDocument document)
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

    /// <summary>Gets the root of the validated ArcIR JSON document.</summary>
    public JsonElement Root => Document.RootElement;

    /// <summary>Gets the owned JSON document; its lifetime is controlled by the workspace snapshot.</summary>
    public JsonDocument Document { get; } = document;
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

/// <summary>Loads, validates, caches, and serves the read-only viewer workspace.</summary>
public sealed class WorkspaceService : IDisposable
{
    private const string ManifestRelativePath = ".overarc/viewer.json";
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
    private readonly GraphProjectionBuilder projectionBuilder;
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly Dictionary<string, StateCacheEntry> stateCache = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<WorkspaceSnapshot> retiredSnapshots = [];
    private WorkspaceSnapshot? snapshot;

    /// <summary>Creates a workspace service rooted at an explicitly configured local directory.</summary>
    public WorkspaceService(string workspaceRoot, ArcIrInteropAdapter interop, GraphProjectionBuilder projectionBuilder)
    {
        this.workspaceRoot = Path.GetFullPath(workspaceRoot);
        this.interop = interop;
        this.projectionBuilder = projectionBuilder;
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

    /// <summary>Strictly loads the manifest and validates each state independently into a replacement snapshot.</summary>
    private async Task<WorkspaceSnapshot> LoadAsync(CancellationToken cancellationToken)
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
            fullPath = ResolveSafeStatePath(entry.Path);
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
        var artifact = new StateArtifact(entry.Id, entry.Label, entry.Path, fullPath, entry.Sha256, lastWrite, document);
        return (Summary(entry, "valid", lastWrite, formatVersion, objectCount, relationCount, []), artifact);
    }

    /// <summary>Resolves a relative state path while rejecting root escape and symbolic-link traversal.</summary>
    private string ResolveSafeStatePath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath) || Path.IsPathRooted(relativePath))
            throw new WorkspaceException("State paths must be non-empty paths relative to the workspace.");

        var candidate = Path.GetFullPath(Path.Combine(workspaceRoot, relativePath.Replace('/', Path.DirectorySeparatorChar)));
        var rootPrefix = workspaceRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
            throw new WorkspaceException($"State path '{relativePath}' escapes the workspace root.");

        var current = workspaceRoot;
        foreach (var segment in Path.GetRelativePath(workspaceRoot, candidate).Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
        {
            current = Path.Combine(current, segment);
            if ((File.Exists(current) || Directory.Exists(current))
                && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new WorkspaceException($"State path '{relativePath}' traverses a symbolic link or reparse point.");
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

    /// <summary>Releases active and retired immutable snapshots plus the synchronization gate.</summary>
    public void Dispose()
    {
        snapshot?.Dispose();
        foreach (var retired in retiredSnapshots) retired.Dispose();
        gate.Dispose();
    }
}
