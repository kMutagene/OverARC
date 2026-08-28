using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using OverARC.Api;
using Xunit;

namespace OverARC.Api.Tests;

public sealed class ApiTests : IClassFixture<ExampleApiFactory>
{
    private readonly HttpClient client;

    public ApiTests(ExampleApiFactory factory) => client = factory.CreateClient();

    [Fact]
    public async Task Health_is_available()
    {
        var response = await client.GetAsync("/_health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ok", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Workspace_lists_valid_states()
    {
        var workspace = await client.GetFromJsonAsync<WorkspaceDto>("/api/v1/workspace");
        Assert.NotNull(workspace);
        Assert.Equal("OverARC example workspace", workspace.Name);
        Assert.Equal(2, workspace.States.Count);
        Assert.All(workspace.States, state => Assert.Equal("valid", state.Status));
        Assert.Contains(workspace.DefaultStateId, new[] { "state-a", "state-b" });
    }

    [Fact]
    public async Task Workspace_response_matches_the_checked_in_contract_snapshot()
    {
        var actual = JsonNode.Parse(await client.GetStringAsync("/api/v1/workspace"))!.AsObject();
        actual["defaultStateId"] = "<state>";
        foreach (var state in actual["states"]!.AsArray()) state!["lastWriteUtc"] = "<timestamp>";
        var expectedPath = Path.Combine(ExampleApiFactory.RepositoryRoot, "tests", "contracts", "workspace.response.json");
        var expected = JsonNode.Parse(await File.ReadAllTextAsync(expectedPath));
        Assert.True(JsonNode.DeepEquals(expected, actual), $"Actual response:\n{actual.ToJsonString(new JsonSerializerOptions { WriteIndented = true })}");
    }

    [Fact]
    public async Task Projection_preserves_multiedges_and_adds_missing_endpoint_placeholders()
    {
        var projection = await client.GetFromJsonAsync<GraphProjectionDto>("/api/v1/states/state-a/projection");
        Assert.NotNull(projection);
        Assert.Equal(5, projection.Nodes.Count);
        Assert.Equal(5, projection.Relations.Count);
        Assert.Contains(projection.Nodes, node => node.Id.EndsWith("SAM-MISSING", StringComparison.Ordinal) && node.IsPlaceholder);
        Assert.Equal(2, projection.Relations.Count(relation => relation.PredicateId.EndsWith("contains", StringComparison.Ordinal)));
        Assert.Contains(projection.Relations, relation => relation.IsDerived);
    }

    [Fact]
    public async Task Projection_reports_bounded_term_usage_summaries()
    {
        var projection = await client.GetFromJsonAsync<GraphProjectionDto>("/api/v1/states/state-a/projection");
        Assert.NotNull(projection);

        var relationPredicate = Assert.Single(projection.Terms, term => term.Id == "urn:overarc:term:contains");
        Assert.True(relationPredicate.UsageCount > 0);
        Assert.Contains("relationPredicate", relationPredicate.UsageRoles);

        var unit = Assert.Single(projection.Terms, term => term.Id == "urn:overarc:term:unit-celsius");
        Assert.Equal(1, unit.UsageCount);
        Assert.Equal(["unit"], unit.UsageRoles);
    }

    [Fact]
    public async Task Term_details_match_projection_summaries_and_unknown_terms_use_problem_responses()
    {
        var projection = await client.GetFromJsonAsync<GraphProjectionDto>("/api/v1/states/state-a/projection");
        Assert.NotNull(projection);
        var summary = Assert.Single(projection.Terms, term => term.Id == "urn:overarc:term:measurement");

        var response = await client.PostAsJsonAsync(
            "/api/v1/states/state-a/term-details",
            new TermDetailRequest(summary.Id));
        response.EnsureSuccessStatusCode();
        var detail = await response.Content.ReadFromJsonAsync<TermDetailDto>();
        Assert.NotNull(detail);
        Assert.Equal(summary.UsageCount, detail.Usages.Count);
        Assert.Equal(summary.UsageRoles, detail.UsageRoles);
        Assert.All(detail.Usages, usage => Assert.StartsWith("#/graph/", usage.Selector, StringComparison.Ordinal));

        var unknown = await client.PostAsJsonAsync(
            "/api/v1/states/state-a/term-details",
            new TermDetailRequest("urn:missing"));
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("application/problem+json", unknown.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Detail_keeps_unsafe_integer_exact_and_selectors_escape_ids()
    {
        var response = await client.PostAsJsonAsync("/api/v1/states/state-a/details",
            new DetailRequest("object", "urn:biofsharp:insdc:object:PRJTEST001"));
        response.EnsureSuccessStatusCode();
        var detail = await response.Content.ReadFromJsonAsync<ElementDetailDto>();
        Assert.NotNull(detail);
        Assert.Equal("PRJTEST001", detail.Label);
        Assert.Contains(detail.Properties, property => property.Value.Type == "integer" && property.Value.Text == "9223372036854775807");

        var unicode = await client.PostAsJsonAsync("/api/v1/states/state-a/details",
            new DetailRequest("object", "urn:overarc:object:unicode/ä~leaf"));
        unicode.EnsureSuccessStatusCode();
        var unicodeDetail = await unicode.Content.ReadFromJsonAsync<ElementDetailDto>();
        Assert.NotNull(unicodeDetail);
        Assert.Contains("~1", unicodeDetail.Selector, StringComparison.Ordinal);
        Assert.Contains("~0", unicodeDetail.Selector, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Unknown_state_and_element_use_problem_responses()
    {
        var unknownState = await client.GetAsync("/api/v1/states/not-here/projection");
        Assert.Equal(HttpStatusCode.NotFound, unknownState.StatusCode);
        Assert.Equal("application/problem+json", unknownState.Content.Headers.ContentType?.MediaType);

        var unknownElement = await client.PostAsJsonAsync("/api/v1/states/state-a/details", new DetailRequest("object", "urn:missing"));
        Assert.Equal(HttpStatusCode.NotFound, unknownElement.StatusCode);
    }

    [Fact]
    public async Task Refresh_revalidates_without_changing_files()
    {
        var before = File.GetLastWriteTimeUtc(Path.Combine(ExampleApiFactory.WorkspaceRoot, ".overarc", "viewer.json"));
        var response = await client.PostAsync("/api/v1/workspace/refresh", null);
        response.EnsureSuccessStatusCode();
        Assert.Equal(before, File.GetLastWriteTimeUtc(Path.Combine(ExampleApiFactory.WorkspaceRoot, ".overarc", "viewer.json")));
    }
}

public sealed class ExampleApiFactory : WebApplicationFactory<Program>
{
    public static string RepositoryRoot { get; } = FindRepositoryRoot();
    public static string WorkspaceRoot { get; } = Path.Combine(RepositoryRoot, "tests", "fixtures", "viewer-workspace");

    protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseSetting("workspace", WorkspaceRoot);

    private static string FindRepositoryRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "OverARC.slnx"))) return current.FullName;
            current = current.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate the OverARC repository root.");
    }
}
