using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using OverARC.Api;
using Xunit;

namespace OverARC.Api.Tests;

public sealed class CurationApiTests
{
    private const string StateId = "state-a";
    private const string Literal = "Fictional Arabidopsis temperature study";
    private const string TargetProject = "urn:overarc:term:project";
    private static readonly string Selector = new ArcIrInteropAdapter().PropertyValueSelector(
        "urn:biofsharp:insdc:object:PRJTEST001",
        "urn:overarc:assertion:project-title");

    [Fact]
    public async Task Complete_HTTP_flow_projects_replayed_views_undoes_and_publishes_successors()
    {
        using var factory = EditableApiFactory.Create();
        using var client = factory.CreateClient();
        var baseMappings = await client.GetFromJsonAsync<MappingsDto>($"/api/v1/states/{StateId}/mappings");
        Assert.NotNull(baseMappings);
        Assert.False(baseMappings.IsDraft);
        Assert.Empty(baseMappings.Mappings);

        var createResponse = await client.PostAsJsonAsync(
            $"/api/v1/states/{StateId}/drafts",
            new CreateDraftRequest("curator@example.org"));
        createResponse.EnsureSuccessStatusCode();
        var created = await createResponse.Content.ReadFromJsonAsync<CurationDraftDto>();
        Assert.NotNull(created);
        Assert.Equal("0", created.Revision);
        Assert.Empty(created.Operations);

        var reattached = await client.GetFromJsonAsync<CurationDraftDto>($"/api/v1/drafts/{created.Id}");
        Assert.Equal(created.Id, reattached?.Id);
        Assert.NotNull(await client.GetFromJsonAsync<GraphProjectionDto>($"/api/v1/drafts/{created.Id}/projection"));
        Assert.Equal(
            "PRJTEST001",
            (await PostAsync<ElementDetailDto>(
                client,
                $"/api/v1/drafts/{created.Id}/details",
                new DetailRequest("object", "urn:biofsharp:insdc:object:PRJTEST001"))).Label);
        Assert.Equal(
            TargetProject,
            (await PostAsync<TermDetailDto>(
                client,
                $"/api/v1/drafts/{created.Id}/term-details",
                new TermDetailRequest(TargetProject))).Id);
        Assert.Empty((await client.GetFromJsonAsync<MappingsDto>($"/api/v1/drafts/{created.Id}/mappings"))!.Mappings);

        var added = await PostAsync<CurationDraftDto>(
            client,
            $"/api/v1/drafts/{created.Id}/literal-term-mappings",
            MappingRequest("0"));
        Assert.Equal("1", added.Revision);
        var operation = Assert.Single(added.Operations);
        Assert.Equal(Selector, operation.Selector);
        Assert.True(operation.MappingCreated);
        Assert.StartsWith("urn:uuid:", operation.MappingRecord.RecordId, StringComparison.Ordinal);
        var draftProjection = await client.GetFromJsonAsync<GraphProjectionDto>($"/api/v1/drafts/{created.Id}/projection");
        Assert.Contains(draftProjection!.Terms.Single(term => term.Id == TargetProject).UsageRoles, role => role == "termValue");
        var draftMappings = await client.GetFromJsonAsync<MappingsDto>($"/api/v1/drafts/{created.Id}/mappings");
        var draftRow = Assert.Single(draftMappings!.Mappings);
        AssertField(draftRow, "subject_label", Literal);
        AssertField(draftRow, "object_id", TargetProject);
        Assert.DoesNotContain(draftRow.Fields, field => field.Name == "mapping_date");

        var undone = await DeleteAsync<CurationDraftDto>(
            client,
            $"/api/v1/drafts/{created.Id}/operations/{operation.Id}",
            new DraftRevisionRequest("1"));
        Assert.Equal("2", undone.Revision);
        Assert.Empty(undone.Operations);
        Assert.Empty((await client.GetFromJsonAsync<MappingsDto>($"/api/v1/drafts/{created.Id}/mappings"))!.Mappings);

        var ready = await PostAsync<CurationDraftDto>(
            client,
            $"/api/v1/drafts/{created.Id}/literal-term-mappings",
            MappingRequest("2"));
        var saved = await PostAsync<CurationSaveDto>(
            client,
            $"/api/v1/drafts/{created.Id}/save",
            new DraftRevisionRequest(ready.Revision));
        Assert.Equal(created.ProcessName, saved.ProcessName);
        Assert.True(saved.MappingCreated);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/drafts/{created.Id}")).StatusCode);
        var workspace = await client.GetFromJsonAsync<WorkspaceDto>("/api/v1/workspace");
        Assert.Equal(saved.SuccessorStateId, workspace?.DefaultStateId);
        var committedMappings = await client.GetFromJsonAsync<MappingsDto>(
            $"/api/v1/states/{Uri.EscapeDataString(saved.SuccessorStateId)}/mappings");
        var committedRow = Assert.Single(committedMappings!.Mappings);
        AssertField(committedRow, "mapping_date", saved.SaveUtc.UtcDateTime.ToString("yyyy-MM-dd"));
    }

    [Fact]
    public async Task HTTP_problem_contract_distinguishes_unknown_conflict_and_validation_failures()
    {
        using var factory = EditableApiFactory.Create();
        using var client = factory.CreateClient();
        await AssertProblemAsync(await client.GetAsync("/api/v1/drafts/not-here"), HttpStatusCode.NotFound, false);
        await AssertProblemAsync(await client.GetAsync("/api/v1/states/not-here/mappings"), HttpStatusCode.NotFound, false);
        var created = await PostAsync<CurationDraftDto>(
            client,
            $"/api/v1/states/{StateId}/drafts",
            new CreateDraftRequest("Curator"));

        await AssertProblemAsync(
            await DeleteResponseAsync(
                client,
                $"/api/v1/drafts/{created.Id}/operations/not-here",
                new DraftRevisionRequest("0")),
            HttpStatusCode.NotFound,
            false);
        await AssertProblemAsync(
            await client.PostAsJsonAsync(
                $"/api/v1/drafts/{created.Id}/literal-term-mappings",
                MappingRequest("-1")),
            HttpStatusCode.UnprocessableEntity,
            true);
        await AssertProblemAsync(
            await client.PostAsJsonAsync(
                $"/api/v1/drafts/{created.Id}/literal-term-mappings",
                MappingRequest("0") with { TargetTermId = "urn:not:registered" }),
            HttpStatusCode.UnprocessableEntity,
            true);
        await AssertProblemAsync(
            await client.PostAsJsonAsync(
                $"/api/v1/drafts/{created.Id}/save",
                new DraftRevisionRequest("0")),
            HttpStatusCode.UnprocessableEntity,
            true);

        var added = await PostAsync<CurationDraftDto>(
            client,
            $"/api/v1/drafts/{created.Id}/literal-term-mappings",
            MappingRequest("0"));
        await AssertProblemAsync(
            await client.PostAsJsonAsync(
                $"/api/v1/drafts/{created.Id}/literal-term-mappings",
                MappingRequest("0")),
            HttpStatusCode.Conflict,
            false);
        await AssertProblemAsync(
            await DeleteResponseAsync(client, $"/api/v1/drafts/{created.Id}", new DraftRevisionRequest("0")),
            HttpStatusCode.Conflict,
            false);
        var discarded = await DeleteResponseAsync(
            client,
            $"/api/v1/drafts/{created.Id}",
            new DraftRevisionRequest(added.Revision));
        Assert.Equal(HttpStatusCode.NoContent, discarded.StatusCode);
        await AssertProblemAsync(await client.GetAsync($"/api/v1/drafts/{created.Id}"), HttpStatusCode.NotFound, false);
    }

    [Fact]
    public async Task Changed_base_digest_returns_conflict_through_every_live_draft_read_path()
    {
        using var factory = EditableApiFactory.Create();
        using var client = factory.CreateClient();
        var created = await PostAsync<CurationDraftDto>(
            client,
            $"/api/v1/states/{StateId}/drafts",
            new CreateDraftRequest("Curator"));
        await File.AppendAllTextAsync(Path.Combine(factory.WorkspaceRoot, "arcir", "states", "state-a.arcir.json"), "\n");

        await AssertProblemAsync(await client.GetAsync($"/api/v1/drafts/{created.Id}"), HttpStatusCode.Conflict, false);
        await AssertProblemAsync(await client.GetAsync($"/api/v1/drafts/{created.Id}/projection"), HttpStatusCode.Conflict, false);
        await AssertProblemAsync(await client.GetAsync($"/api/v1/drafts/{created.Id}/mappings"), HttpStatusCode.Conflict, false);
    }

    [Fact]
    public async Task OpenAPI_documents_every_curation_route_revision_body_and_problem_status()
    {
        using var factory = EditableApiFactory.Create();
        using var client = factory.CreateClient();
        var document = JsonNode.Parse(await client.GetStringAsync("/openapi/v1.json"))!.AsObject();
        var paths = document["paths"]!.AsObject();
        var expectations = new Dictionary<string, (string Method, string[] Responses)>
        {
            ["/api/v1/states/{stateId}/mappings"] = ("get", ["200", "404", "422"]),
            ["/api/v1/states/{stateId}/drafts"] = ("post", ["200", "404", "422"]),
            ["/api/v1/drafts/{draftId}"] = ("get", ["200", "404", "409"]),
            ["/api/v1/drafts/{draftId}#delete"] = ("delete", ["204", "404", "409", "422"]),
            ["/api/v1/drafts/{draftId}/projection"] = ("get", ["200", "404", "409"]),
            ["/api/v1/drafts/{draftId}/details"] = ("post", ["200", "404", "409"]),
            ["/api/v1/drafts/{draftId}/term-details"] = ("post", ["200", "404", "409"]),
            ["/api/v1/drafts/{draftId}/mappings"] = ("get", ["200", "404", "409"]),
            ["/api/v1/drafts/{draftId}/literal-term-mappings"] = ("post", ["200", "404", "409", "422"]),
            ["/api/v1/drafts/{draftId}/operations/{operationId}"] = ("delete", ["200", "404", "409", "422"]),
            ["/api/v1/drafts/{draftId}/save"] = ("post", ["200", "404", "409", "422"])
        };

        foreach (var expectation in expectations)
        {
            var path = expectation.Key.Replace("#delete", string.Empty, StringComparison.Ordinal);
            var operation = paths[path]![expectation.Value.Method]!.AsObject();
            Assert.False(string.IsNullOrWhiteSpace(operation["summary"]?.GetValue<string>()));
            var responses = operation["responses"]!.AsObject();
            Assert.All(expectation.Value.Responses, status => Assert.True(responses.ContainsKey(status), $"{expectation.Key} lacks {status}."));
        }

        var schemas = document["components"]!["schemas"]!.AsObject();
        Assert.Equal("string", schemas["DraftRevisionRequest"]!["properties"]!["expectedRevision"]!["type"]!.GetValue<string>());
        Assert.Equal("string", schemas["AddLiteralMappingDto"]!["properties"]!["expectedRevision"]!["type"]!.GetValue<string>());
        Assert.Equal("string", schemas["CurationDraftDto"]!["properties"]!["revision"]!["type"]!.GetValue<string>());
        Assert.NotNull(paths["/api/v1/drafts/{draftId}"]!["delete"]!["requestBody"]);
        Assert.NotNull(paths["/api/v1/drafts/{draftId}/operations/{operationId}"]!["delete"]!["requestBody"]);
    }

    private static AddLiteralMappingDto MappingRequest(string revision) =>
        new(revision, Selector, Literal, TargetProject, "skos:exactMatch");

    private static async Task<T> PostAsync<T>(HttpClient client, string path, object request)
    {
        var response = await client.PostAsJsonAsync(path, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<T> DeleteAsync<T>(HttpClient client, string path, object request)
    {
        var response = await DeleteResponseAsync(client, path, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static Task<HttpResponseMessage> DeleteResponseAsync(HttpClient client, string path, object request) =>
        client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, path) { Content = JsonContent.Create(request) });

    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, bool hasErrors)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(string.IsNullOrWhiteSpace(problem.GetProperty("title").GetString()));
        Assert.Equal(hasErrors, problem.TryGetProperty("errors", out var errors) && errors.GetArrayLength() > 0);
    }

    private static void AssertField(SssomMappingView mapping, string name, string expected) =>
        Assert.Contains(mapping.Fields, field => field.Name == name && field.Values.Contains(expected, StringComparer.Ordinal));

    private sealed class EditableApiFactory(string workspaceRoot) : WebApplicationFactory<Program>
    {
        public string WorkspaceRoot { get; } = workspaceRoot;

        public static EditableApiFactory Create()
        {
            var source = Path.Combine(ExampleApiFactory.RepositoryRoot, "tests", "fixtures", "editable-workspace");
            var root = Path.Combine(Path.GetTempPath(), "overarc-curation-api-tests", Guid.NewGuid().ToString("N"));
            foreach (var sourcePath in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
            {
                var destination = Path.Combine(root, Path.GetRelativePath(source, sourcePath));
                Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                File.Copy(sourcePath, destination);
            }

            return new EditableApiFactory(root);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseSetting("workspace", WorkspaceRoot);

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing && Directory.Exists(WorkspaceRoot)) Directory.Delete(WorkspaceRoot, recursive: true);
        }
    }
}
