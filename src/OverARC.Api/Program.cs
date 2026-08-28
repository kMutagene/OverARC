using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using OverARC.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// Keep transport JSON camel-cased and omit unavailable union fields instead of emitting null noise.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});
builder.Services.AddOpenApi();
// Core-library representations terminate in these adapters; services and HTTP contracts consume only ordinary C# values.
builder.Services.AddSingleton<ArcIrInteropAdapter>();
builder.Services.AddSingleton<SssomInteropAdapter>();
builder.Services.AddSingleton<ProcessCoreInteropAdapter>();
builder.Services.AddSingleton<GraphProjectionBuilder>();

// Resolve an explicit workspace first, then choose the packaged or repository example by host layout.
builder.Services.AddSingleton(provider =>
{
    var configured = builder.Configuration["workspace"] ?? Environment.GetEnvironmentVariable("OVERARC_WORKSPACE");
    var developmentDefault = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", "examples", "viewer-workspace"));
    var publishedDefault = Path.Combine(builder.Environment.ContentRootPath, "examples", "viewer-workspace");
    var workspace = configured ?? (Directory.Exists(publishedDefault) ? publishedDefault : developmentDefault);
    return new WorkspaceService(
        workspace,
        provider.GetRequiredService<ArcIrInteropAdapter>(),
        provider.GetRequiredService<SssomInteropAdapter>(),
        provider.GetRequiredService<ProcessCoreInteropAdapter>(),
        provider.GetRequiredService<GraphProjectionBuilder>());
});
builder.Services.AddSingleton(provider => new DraftService(
    provider.GetRequiredService<WorkspaceService>(),
    provider.GetRequiredService<ArcIrInteropAdapter>(),
    provider.GetRequiredService<SssomInteropAdapter>(),
    provider.GetRequiredService<GraphProjectionBuilder>()));
builder.Services.AddSingleton(provider => new SaveService(
    provider.GetRequiredService<WorkspaceService>(),
    provider.GetRequiredService<DraftService>(),
    provider.GetRequiredService<ArcIrInteropAdapter>(),
    provider.GetRequiredService<SssomInteropAdapter>(),
    provider.GetRequiredService<ProcessCoreInteropAdapter>()));

var app = builder.Build();

app.MapOpenApi();

// Lightweight liveness endpoint used by development orchestration and browser tests.
app.MapGet("/_health", () => Results.Ok(new { status = "ok" }));

// Workspace endpoints expose application configuration and perform read-only refreshes.
app.MapGet("/api/v1/workspace", async (WorkspaceService service, CancellationToken cancellationToken) =>
    await Execute(() => service.GetWorkspaceAsync(cancellationToken)));

app.MapPost("/api/v1/workspace/refresh", async (WorkspaceService service, CancellationToken cancellationToken) =>
    await Execute(() => service.RefreshAsync(cancellationToken)));

// State endpoints expose a compact graph first and fetch complete details on demand.
app.MapGet("/api/v1/states/{stateId}/projection", async (string stateId, WorkspaceService service, CancellationToken cancellationToken) =>
    await Execute(() => service.GetProjectionAsync(stateId, cancellationToken)));

app.MapPost("/api/v1/states/{stateId}/details", async (string stateId, DetailRequest request, WorkspaceService service, CancellationToken cancellationToken) =>
{
    var result = await Execute(() => service.GetDetailsAsync(stateId, request, cancellationToken));
    return result;
});

app.MapPost("/api/v1/states/{stateId}/term-details", async (string stateId, TermDetailRequest request, WorkspaceService service, CancellationToken cancellationToken) =>
{
    var result = await Execute(() => service.GetTermDetailsAsync(stateId, request, cancellationToken));
    return result;
});

app.MapGet("/api/v1/states/{stateId}/mappings", async (string stateId, WorkspaceService service, CancellationToken cancellationToken) =>
        await Execute(() => service.GetMappingsAsync(stateId, cancellationToken)))
    .WithSummary("Get state mappings")
    .WithDescription("Returns the valid SSSOM 1.1 artifact paired to one native ArcIR state.")
    .Produces<MappingsDto>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

app.MapPost("/api/v1/states/{stateId}/drafts", async (string stateId, CreateDraftRequest request, DraftService service, CancellationToken cancellationToken) =>
        await Execute(async () => CurationContractMapper.Draft(await service.CreateAsync(stateId, request.Curator, cancellationToken))))
    .WithSummary("Create draft")
    .WithDescription("Creates a server-owned draft against the selected state's exact current ArcIR and SSSOM digests.")
    .Produces<CurationDraftDto>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

app.MapGet("/api/v1/drafts/{draftId}", async (string draftId, DraftService service, CancellationToken cancellationToken) =>
        await Execute(async () => CurationContractMapper.Draft(await service.GetAsync(draftId, cancellationToken))))
    .WithSummary("Get draft")
    .WithDescription("Reattaches to a live server draft after verifying that its immutable bases remain current.")
    .Produces<CurationDraftDto>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status409Conflict);

app.MapDelete("/api/v1/drafts/{draftId}", async (
        string draftId,
        [FromBody] DraftRevisionRequest request,
        DraftService service,
        CancellationToken cancellationToken) =>
        await ExecuteNoContent(() => service.DiscardAsync(
            draftId,
            CurationContractMapper.Revision(request.ExpectedRevision),
            cancellationToken)))
    .WithSummary("Discard draft")
    .WithDescription("Discards a live draft only when expectedRevision equals its current decimal revision.")
    .Produces(StatusCodes.Status204NoContent)
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status409Conflict)
    .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

app.MapGet("/api/v1/drafts/{draftId}/projection", async (string draftId, DraftService service, CancellationToken cancellationToken) =>
        await Execute(() => service.GetProjectionAsync(draftId, cancellationToken)))
    .WithSummary("Get draft projection")
    .WithDescription("Builds the graph, table, and term projection from the replayed draft ArcIR artifact.")
    .Produces<GraphProjectionDto>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status409Conflict);

app.MapPost("/api/v1/drafts/{draftId}/details", async (
        string draftId,
        DetailRequest request,
        DraftService service,
        CancellationToken cancellationToken) =>
        await Execute(() => service.GetDetailsAsync(draftId, request, cancellationToken)))
    .WithSummary("Get draft element details")
    .WithDescription("Returns exact object or relation details from the replayed draft ArcIR artifact.")
    .Produces<ElementDetailDto>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status409Conflict);

app.MapPost("/api/v1/drafts/{draftId}/term-details", async (
        string draftId,
        TermDetailRequest request,
        DraftService service,
        CancellationToken cancellationToken) =>
        await Execute(() => service.GetTermDetailsAsync(draftId, request, cancellationToken)))
    .WithSummary("Get draft term details")
    .WithDescription("Returns a registered term and all of its replayed draft occurrences.")
    .Produces<TermDetailDto>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status409Conflict);

app.MapGet("/api/v1/drafts/{draftId}/mappings", async (string draftId, DraftService service, CancellationToken cancellationToken) =>
        await Execute(() => service.GetMappingsAsync(draftId, cancellationToken)))
    .WithSummary("Get draft mappings")
    .WithDescription("Returns SSSOM metadata and rows from the replayed in-memory draft artifact.")
    .Produces<MappingsDto>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status409Conflict);

app.MapPost("/api/v1/drafts/{draftId}/literal-term-mappings", async (
        string draftId,
        AddLiteralMappingDto request,
        DraftService service,
        CancellationToken cancellationToken) =>
        await Execute(async () => CurationContractMapper.Draft(await service.AddLiteralMappingAsync(
            draftId,
            new AddLiteralMappingRequest(
                CurationContractMapper.Revision(request.ExpectedRevision),
                request.Selector,
                request.Literal,
                request.TargetTermId,
                request.PredicateId),
            cancellationToken))))
    .WithSummary("Add literal-to-term mapping")
    .WithDescription("Appends one typed mapping operation only when expectedRevision equals the current decimal revision.")
    .Produces<CurationDraftDto>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status409Conflict)
    .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

app.MapDelete("/api/v1/drafts/{draftId}/operations/{operationId}", async (
        string draftId,
        string operationId,
        [FromBody] DraftRevisionRequest request,
        DraftService service,
        CancellationToken cancellationToken) =>
        await Execute(async () => CurationContractMapper.Draft(await service.RemoveCommandAsync(
            draftId,
            new RemoveDraftCommandRequest(CurationContractMapper.Revision(request.ExpectedRevision), operationId),
            cancellationToken))))
    .WithSummary("Undo draft operation")
    .WithDescription("Removes one typed operation and replays its siblings when expectedRevision equals the current decimal revision.")
    .Produces<CurationDraftDto>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status409Conflict)
    .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

app.MapPost("/api/v1/drafts/{draftId}/save", async (
        string draftId,
        DraftRevisionRequest request,
        SaveService service,
        CancellationToken cancellationToken) =>
        await Execute(async () => CurationContractMapper.Save(await service.SaveAsync(
            draftId,
            CurationContractMapper.Revision(request.ExpectedRevision),
            cancellationToken))))
    .WithSummary("Save draft")
    .WithDescription("Replays, validates, and atomically publishes immutable successors when expectedRevision equals the current decimal revision.")
    .Produces<CurationSaveDto>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status409Conflict)
    .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

app.UseDefaultFiles();
app.UseStaticFiles();
if (File.Exists(Path.Combine(app.Environment.WebRootPath ?? string.Empty, "index.html")))
    app.MapFallbackToFile("index.html");

app.Run();

// Maps service results and domain exceptions into consistent JSON or RFC 7807 HTTP results.
static async Task<IResult> Execute<T>(Func<Task<T>> action)
{
    try
    {
        var value = await action();
        return value is null
            ? Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Element not found", detail: "The selected element is not present in this state.")
            : Results.Ok(value);
    }
    catch (Exception error) when (IsExpectedProblem(error))
    {
        return ExpectedProblem(error);
    }
}

// Executes a mutation whose success response intentionally carries no representation.
static async Task<IResult> ExecuteNoContent(Func<Task> action)
{
    try
    {
        await action();
        return Results.NoContent();
    }
    catch (Exception error) when (IsExpectedProblem(error))
    {
        return ExpectedProblem(error);
    }
}

// Limits RFC 7807 conversion to known application failures so unexpected defects retain their normal diagnostics.
static bool IsExpectedProblem(Exception error) =>
    error is KeyNotFoundException
        or InvalidStateException
        or MappingUnavailableException
        or WorkspaceException
        or DraftNotFoundException
        or DraftOperationNotFoundException
        or DraftConflictException
        or DraftValidationException
        or SaveValidationException;

// Maps application failures to the documented RFC 7807 status and structured findings contracts.
static IResult ExpectedProblem(Exception error) => error switch
{
    KeyNotFoundException => Results.Problem(
        statusCode: StatusCodes.Status404NotFound,
        title: "State not found",
        detail: error.Message),
    DraftNotFoundException => Results.Problem(
        statusCode: StatusCodes.Status404NotFound,
        title: "Draft not found",
        detail: error.Message),
    DraftOperationNotFoundException => Results.Problem(
        statusCode: StatusCodes.Status404NotFound,
        title: "Draft operation not found",
        detail: error.Message),
    DraftConflictException => Results.Problem(
        statusCode: StatusCodes.Status409Conflict,
        title: "Draft conflict",
        detail: error.Message),
    InvalidStateException invalid => ValidationProblem("Invalid ArcIR state", invalid.Message, invalid.Errors),
    MappingUnavailableException unavailable => ValidationProblem("Mappings unavailable", unavailable.Message, unavailable.Errors),
    DraftValidationException invalid => ValidationProblem("Invalid draft operation", invalid.Message, invalid.Errors),
    SaveValidationException invalid => ValidationProblem("Invalid curation save", invalid.Message, invalid.Errors),
    WorkspaceException => Results.Problem(
        statusCode: StatusCodes.Status422UnprocessableEntity,
        title: "Invalid viewer workspace",
        detail: error.Message),
    _ => throw new InvalidOperationException("Unexpected application problem mapping.", error)
};

// Adds ordinary structured findings to an RFC 7807 validation response.
static IResult ValidationProblem(string title, string detail, IReadOnlyList<string> errors) =>
    Results.Problem(
        statusCode: StatusCodes.Status422UnprocessableEntity,
        title: title,
        detail: detail,
        extensions: new Dictionary<string, object?> { ["errors"] = errors });

/// <summary>Marker for WebApplicationFactory-based integration tests of the top-level API.</summary>
public partial class Program;
