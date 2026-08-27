using System.Text.Json;
using System.Text.Json.Serialization;
using OverARC.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});
builder.Services.AddOpenApi();
builder.Services.AddSingleton<ArcIrInteropAdapter>();
builder.Services.AddSingleton<GraphProjectionBuilder>();
builder.Services.AddSingleton(provider =>
{
    var configured = builder.Configuration["workspace"] ?? Environment.GetEnvironmentVariable("OVERARC_WORKSPACE");
    var developmentDefault = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", "examples", "viewer-workspace"));
    var publishedDefault = Path.Combine(builder.Environment.ContentRootPath, "examples", "viewer-workspace");
    var workspace = configured ?? (Directory.Exists(publishedDefault) ? publishedDefault : developmentDefault);
    return new WorkspaceService(workspace, provider.GetRequiredService<ArcIrInteropAdapter>(), provider.GetRequiredService<GraphProjectionBuilder>());
});

var app = builder.Build();

app.MapOpenApi();

app.MapGet("/_health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/v1/workspace", async (WorkspaceService service, CancellationToken cancellationToken) =>
    await Execute(() => service.GetWorkspaceAsync(cancellationToken)));

app.MapPost("/api/v1/workspace/refresh", async (WorkspaceService service, CancellationToken cancellationToken) =>
    await Execute(() => service.RefreshAsync(cancellationToken)));

app.MapGet("/api/v1/states/{stateId}/projection", async (string stateId, WorkspaceService service, CancellationToken cancellationToken) =>
    await Execute(() => service.GetProjectionAsync(stateId, cancellationToken)));

app.MapPost("/api/v1/states/{stateId}/details", async (string stateId, DetailRequest request, WorkspaceService service, CancellationToken cancellationToken) =>
{
    var result = await Execute(() => service.GetDetailsAsync(stateId, request, cancellationToken));
    return result;
});

app.UseDefaultFiles();
app.UseStaticFiles();
if (File.Exists(Path.Combine(app.Environment.WebRootPath ?? string.Empty, "index.html")))
    app.MapFallbackToFile("index.html");

app.Run();

static async Task<IResult> Execute<T>(Func<Task<T>> action)
{
    try
    {
        var value = await action();
        return value is null
            ? Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Element not found", detail: "The selected element is not present in this state.")
            : Results.Ok(value);
    }
    catch (KeyNotFoundException error)
    {
        return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "State not found", detail: error.Message);
    }
    catch (InvalidStateException error)
    {
        return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity, title: "Invalid ArcIR state", detail: error.Message,
            extensions: new Dictionary<string, object?> { ["errors"] = error.Errors });
    }
    catch (WorkspaceException error)
    {
        return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity, title: "Invalid viewer workspace", detail: error.Message);
    }
}

public partial class Program;
