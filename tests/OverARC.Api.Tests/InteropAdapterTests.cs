using System.Security.Cryptography;
using System.Reflection;
using OverARC.Api;
using Xunit;

namespace OverARC.Api.Tests;

public sealed class InteropAdapterTests
{
    private static readonly string RepositoryRoot = ExampleApiFactory.RepositoryRoot;

    [Theory]
    [InlineData("examples/viewer-workspace")]
    [InlineData("tests/fixtures/editable-workspace")]
    public void Native_workspaces_declare_valid_digest_bound_ArcIR_and_SSSOM_artifacts(string relativeRoot)
    {
        var workspaceRoot = Path.Combine(RepositoryRoot, relativeRoot.Replace('/', Path.DirectorySeparatorChar));
        var processCore = new ProcessCoreInteropAdapter();
        var arcIr = new ArcIrInteropAdapter();
        var sssom = new SssomInteropAdapter();
        var arcBytes = File.ReadAllBytes(Path.Combine(workspaceRoot, "arc.yml"));

        Assert.Empty(processCore.Validate(arcBytes));
        var nativeArc = processCore.Inspect(arcBytes);
        Assert.Equal(2, nativeArc.Artifacts.Count);

        var arcIrArtifact = Assert.Single(nativeArc.Artifacts, artifact => artifact.ArtifactType == "ArcIR state");
        var sssomArtifact = Assert.Single(nativeArc.Artifacts, artifact => artifact.ArtifactType == "SSSOM mapping set");
        AssertArtifact(workspaceRoot, arcIrArtifact, arcIr.ValidateForEditing);
        AssertArtifact(workspaceRoot, sssomArtifact, sssom.Validate);

        var mappingSet = sssom.Inspect(ReadArtifact(workspaceRoot, sssomArtifact));
        Assert.Equal("1.1", mappingSet.SssomVersion);
        Assert.Equal("https://creativecommons.org/publicdomain/zero/1.0/", mappingSet.License);
        Assert.Equal(0, mappingSet.MappingCount);
        Assert.Empty(processCore.Validate(processCore.EncodeCanonical(arcBytes)));
    }

    [Theory]
    [InlineData("examples/viewer-workspace/mappings/PRJDB5192_A.sssom.tsv")]
    [InlineData("tests/fixtures/editable-workspace/mappings/state-a.sssom.tsv")]
    public void Empty_mapping_sets_are_canonical_SSSOM_1_1(string relativePath)
    {
        var adapter = new SssomInteropAdapter();
        var bytes = File.ReadAllBytes(Path.Combine(RepositoryRoot, relativePath.Replace('/', Path.DirectorySeparatorChar)));

        Assert.Empty(adapter.Validate(bytes));
        Assert.Equal(bytes, adapter.EncodeCanonical(bytes));
    }

    [Fact]
    public void Sssom_adapter_retains_declared_metadata_and_row_extensions()
    {
        const string input = """
            #sssom_version: 1.1
            #curie_map:
            #  ex: https://example.org/
            #mapping_set_id: https://example.org/set
            #license: https://example.org/license
            #extension_definitions:
            #  - slot_name: ext_note
            #    property: ex:note
            #ext_note: set-note
            subject_id	predicate_id	object_id	mapping_justification	ext_note
            ex:s	skos:exactMatch	ex:o	semapv:ManualMappingCuration	row-note

            """;
        var adapter = new SssomInteropAdapter();
        var bytes = System.Text.Encoding.UTF8.GetBytes(input);

        Assert.Empty(adapter.Validate(bytes));
        var canonical = System.Text.Encoding.UTF8.GetString(adapter.EncodeCanonical(bytes));
        Assert.Contains("#ext_note: set-note", canonical, StringComparison.Ordinal);
        Assert.Contains("\text_note\n", canonical, StringComparison.Ordinal);
        Assert.Contains("\trow-note\n", canonical, StringComparison.Ordinal);
        var view = adapter.InspectDocument(bytes);
        Assert.Contains(view.MetadataFields, field => field.Name == "ext_note" && field.Values.SequenceEqual(["set-note"]));
        var mapping = Assert.Single(view.Mappings);
        Assert.Contains(mapping.Fields, field => field.Name == "ext_note" && field.Values.SequenceEqual(["row-note"]));
        Assert.Contains(mapping.Fields, field => field.Name == "subject_id" && field.Values.SequenceEqual(["https://example.org/s"]));
    }

    [Fact]
    public void ProcessCore_adapter_round_trips_complete_and_fragment_level_curation_provenance()
    {
        var root = Path.Combine(RepositoryRoot, "tests", "fixtures", "editable-workspace");
        var adapter = new ProcessCoreInteropAdapter();
        var baseBytes = File.ReadAllBytes(Path.Combine(root, "arc.yml"));
        var summary = adapter.Inspect(baseBytes);
        var oldArc = Assert.Single(summary.Artifacts, artifact => artifact.ArtifactType == "ArcIR state");
        var oldMapping = Assert.Single(summary.Artifacts, artifact => artifact.ArtifactType == "SSSOM mapping set");
        var processName = "overarc-curation-01991d8d-04c0-7c3c-8e42-6ca16a0f9341";
        var result = adapter.BuildCurationArc(
            baseBytes,
            new ProcessCoreCurationPlan(
                processName,
                "curator@example.org",
                new DateTimeOffset(2026, 8, 28, 14, 0, 0, TimeSpan.Zero),
                new NativeArtifactRevision(oldArc.Path, oldArc.Sha256!, "ArcIR state", "application/json"),
                new NativeArtifactRevision("arcir/states/successor.arcir.json", new string('1', 64), "ArcIR state", "application/json"),
                new NativeArtifactRevision(oldMapping.Path, oldMapping.Sha256!, "SSSOM mapping set", "text/tab-separated-values"),
                new NativeArtifactRevision("mappings/successor.sssom.tsv", new string('2', 64), "SSSOM mapping set", "text/tab-separated-values"),
                [
                    new NativeCurationOperation(
                        "#/graph/objects/source/properties/input/value",
                        "#/graph/objects/source/properties/output/value",
                        "control",
                        "http://purl.obolibrary.org/obo/OBI_0000220",
                        "skos:exactMatch",
                        true,
                        new SssomMappingRecord(
                            0,
                            "urn:uuid:01991d8d-04c0-7c3c-8e42-6ca16a0f9342",
                            "control",
                            "skos:exactMatch",
                            "http://purl.obolibrary.org/obo/OBI_0000220",
                            "control role",
                            "semapv:ManualMappingCuration"))
                ]));

        Assert.True(result.IsSuccess, string.Join("; ", result.Errors));
        Assert.Empty(adapter.Validate(result.Bytes!));
        Assert.Equal(5, result.Summary!.Processes.Count);
        Assert.All(result.Summary.Processes, process => Assert.Equal(processName, process.Name));
        Assert.Contains(result.Summary.Processes, process => process.ProcessType == "mapping creation");
        Assert.Equal(2, result.Summary.Processes.Count(process => process.ProcessType == "mapping application"));
        Assert.All(result.Summary.Processes, process =>
        {
            Assert.Contains(process.FormalParameters, parameter =>
                parameter.Name == "curation transformation" && parameter.NameTan == "CTRO:0000000");
            Assert.Contains(process.Parameters, parameter =>
                parameter.Name == "curation transformation"
                && parameter.Value == "literal-to-term mapping application"
                && parameter.NameTan == "CTRO:0000000"
                && parameter.ValueTan == "CTRO:0000007");
            Assert.Contains(process.Parameters, parameter => parameter.Name == "curator" && parameter.Value == "curator@example.org");
        });
        Assert.Contains(result.Summary.Processes.SelectMany(process => new[] { process.Input, process.Output }), artifact =>
            artifact?.ArtifactType == "SSSOM mapping record"
            && artifact.Selector == "#row=2"
            && artifact.Annotations.Any(annotation => annotation.Name == "record id"));
    }

    [Fact]
    public void Legacy_manifest_fixture_remains_manifest_only()
    {
        var root = Path.Combine(RepositoryRoot, "tests", "fixtures", "viewer-workspace");
        Assert.True(File.Exists(Path.Combine(root, ".overarc", "viewer.json")));
        Assert.False(File.Exists(Path.Combine(root, "arc.yml")));
        Assert.False(Directory.Exists(Path.Combine(root, "mappings")));
    }

    [Fact]
    public void Public_adapter_contracts_do_not_expose_FSharp_or_core_domain_types()
    {
        var adapterTypes = new[]
        {
            typeof(ArcIrInteropAdapter),
            typeof(SssomInteropAdapter),
            typeof(ProcessCoreInteropAdapter)
        };

        var exposedTypes = adapterTypes
            .SelectMany(type => type.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly))
            .SelectMany(method => method.GetParameters().Select(parameter => parameter.ParameterType).Append(method.ReturnType))
            .SelectMany(FlattenType)
            .Distinct()
            .ToArray();

        Assert.DoesNotContain(exposedTypes, type =>
            type.Namespace?.StartsWith("Microsoft.FSharp", StringComparison.Ordinal) == true
            || type.Assembly.GetName().Name is "BioFSharp.ArcIR" or "PolyglotSSSOM" or "ProcessCore");
    }

    private static void AssertArtifact(
        string workspaceRoot,
        NativeArcArtifact artifact,
        Func<byte[], IReadOnlyList<string>> validate)
    {
        var bytes = ReadArtifact(workspaceRoot, artifact);
        Assert.Equal(Sha256(bytes), artifact.Sha256);
        Assert.Empty(validate(bytes));
    }

    private static byte[] ReadArtifact(string workspaceRoot, NativeArcArtifact artifact)
    {
        var path = Path.GetFullPath(Path.Combine(workspaceRoot, artifact.Path.Replace('/', Path.DirectorySeparatorChar)));
        Assert.StartsWith(Path.GetFullPath(workspaceRoot) + Path.DirectorySeparatorChar, path, StringComparison.OrdinalIgnoreCase);
        return File.ReadAllBytes(path);
    }

    private static string Sha256(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    private static IEnumerable<Type> FlattenType(Type type)
    {
        yield return type;
        if (type.HasElementType && type.GetElementType() is { } elementType)
            foreach (var nested in FlattenType(elementType)) yield return nested;
        foreach (var argument in type.GetGenericArguments())
            foreach (var nested in FlattenType(argument)) yield return nested;
    }
}
