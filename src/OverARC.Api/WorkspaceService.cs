using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace OverARC.Api;

public sealed class WorkspaceException(string message) : Exception(message);
public sealed class InvalidStateException(string stateId, IReadOnlyList<string> errors)
    : Exception($"State '{stateId}' is invalid: {string.Join("; ", errors)}")
{
    public string StateId { get; } = stateId;
    public IReadOnlyList<string> Errors { get; } = errors;
}

internal sealed record ViewerManifest(string FormatVersion, string Name, IReadOnlyList<ManifestState> States);
internal sealed record ManifestState(string Id, string Label, string Path, string Sha256);

public sealed class StateArtifact(
    string id,
    string label,
    string relativePath,
    string fullPath,
    string sha256,
    DateTimeOffset lastWriteUtc,
    JsonDocument document)
{
    public string Id { get; } = id;
    public string Label { get; } = label;
    public string RelativePath { get; } = relativePath;
    public string FullPath { get; } = fullPath;
    public string Sha256 { get; } = sha256;
    public DateTimeOffset LastWriteUtc { get; } = lastWriteUtc;
    public JsonElement Root => Document.RootElement;
    public JsonDocument Document { get; } = document;
}

internal sealed record WorkspaceSnapshot(WorkspaceDto Dto, IReadOnlyDictionary<string, StateArtifact> ValidStates) : IDisposable
{
    public void Dispose()
    {
        foreach (var state in ValidStates.Values) state.Document.Dispose();
    }
}

internal sealed record StateCacheEntry(byte[] Bytes, IReadOnlyList<string> ValidationErrors);

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

    public WorkspaceService(string workspaceRoot, ArcIrInteropAdapter interop, GraphProjectionBuilder projectionBuilder)
    {
        this.workspaceRoot = Path.GetFullPath(workspaceRoot);
        this.interop = interop;
        this.projectionBuilder = projectionBuilder;
    }

    public async Task<WorkspaceDto> GetWorkspaceAsync(CancellationToken cancellationToken) =>
        (await EnsureSnapshotAsync(cancellationToken)).Dto;

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

    public async Task<GraphProjectionDto> GetProjectionAsync(string stateId, CancellationToken cancellationToken)
    {
        var state = await GetStateAsync(stateId, cancellationToken);
        return projectionBuilder.Projection(state);
    }

    public async Task<ElementDetailDto?> GetDetailsAsync(string stateId, DetailRequest request, CancellationToken cancellationToken)
    {
        var state = await GetStateAsync(stateId, cancellationToken);
        return projectionBuilder.Details(state, request);
    }

    private async Task<StateArtifact> GetStateAsync(string stateId, CancellationToken cancellationToken)
    {
        var current = await EnsureSnapshotAsync(cancellationToken);
        if (current.ValidStates.TryGetValue(stateId, out var state)) return state;

        var summary = current.Dto.States.FirstOrDefault(item => item.Id == stateId);
        if (summary is null) throw new KeyNotFoundException($"State '{stateId}' is not listed by this workspace.");
        throw new InvalidStateException(stateId, summary.Errors);
    }

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

    private static StateSummaryDto Summary(
        ManifestState state,
        string status,
        DateTimeOffset? lastWrite,
        string? formatVersion,
        int? objects,
        int? relations,
        IReadOnlyList<string> errors) =>
        new(state.Id, state.Label, state.Path, state.Sha256, status, lastWrite, formatVersion, objects, relations, errors);

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

    public void Dispose()
    {
        snapshot?.Dispose();
        foreach (var retired in retiredSnapshots) retired.Dispose();
        gate.Dispose();
    }
}
