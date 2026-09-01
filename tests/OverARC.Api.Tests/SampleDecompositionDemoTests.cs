using System.Security.Cryptography;
using OverARC.Api;
using Xunit;

namespace OverARC.Api.Tests;

public sealed class SampleDecompositionDemoTests
{
    private const string Sample = "urn:overarc:demo:object:sample";
    private const string SourcePlant = "urn:overarc:demo:object:source-plant";
    private const string Process = "urn:overarc:demo:object:process";
    private const string Growth = "urn:overarc:demo:object:growth";
    private const string GrownPlant = "urn:overarc:demo:object:grown-plant";
    private const string GenotypeAssertion = "urn:overarc:demo:assertion:genotype";
    private const string TemperatureAssertion = "urn:overarc:demo:assertion:temperature";
    private const string ProcessNameAssertion = "urn:overarc:demo:assertion:process-name";
    private const string InputRelation = "urn:overarc:demo:relation:input-1";
    private const string FinalRelation = "urn:overarc:demo:relation:output-final";
    private const string GrowthOutputRelation = "urn:overarc:demo:relation:growth-output";
    private const string ExtractionInputRelation = "urn:overarc:demo:relation:extraction-input";
    private const string LocalGenotype = "urn:overarc:demo:term:genotype";
    private const string LocalTemperature = "urn:overarc:demo:term:temperature";
    private const string SampleType = "urn:overarc:demo:term:sample";
    private const string PlantType = "urn:overarc:demo:term:plant";
    private const string ProcessType = "urn:overarc:demo:term:process";
    private const string HasInput = "urn:overarc:demo:term:has_input";
    private const string HasOutput = "urn:overarc:demo:term:has_output";
    private const string Genotype = "http://purl.obolibrary.org/obo/GENO_0000536";
    private const string Temperature = "http://purl.obolibrary.org/obo/PATO_0000146";
    private const string DegreeCelsius = "http://purl.obolibrary.org/obo/UO_0000027";
    private const string ExactMatch = "skos:exactMatch";
    private const string ExpandedExactMatch = "http://www.w3.org/2004/02/skos/core#exactMatch";
    private const string ExpandedManualCuration = "https://w3id.org/semapv/vocab/ManualMappingCuration";
    private const string JsonPointer = "https://www.rfc-editor.org/rfc/rfc6901";
    private const string TsvRowSelector = "https://www.rfc-editor.org/rfc/rfc7111";
    private const string GenotypeRecord = "urn:uuid:00000000-0000-5000-8000-000000000001";
    private const string TemperatureRecord = "urn:uuid:00000000-0000-5000-8000-000000000002";
    private const string ExternalizeGenotype = "Externalize genotype";
    private const string ExternalizeTemperature = "Insert growth and externalize temperature";
    private const string FlatState = "arcir/states/Flat Sample.arcir.json";
    private const string GenotypeState = "arcir/states/Genotype externalized.arcir.json";
    private const string FinalState = "arcir/states/Growth and extraction.arcir.json";
    private const string MappingSet = "mappings/sample-decomposition.sssom.tsv";

    private static readonly string DemoRoot = Path.Combine(
        ExampleApiFactory.RepositoryRoot,
        "examples",
        "sample-decomposition");

    [Theory]
    [InlineData("s0-flat-sample", "Flat Sample", 1, 0, 2)]
    [InlineData("s1-source-process", "Genotype externalized", 3, 2, 3)]
    [InlineData("s2-growth-extraction", "Growth and extraction", 5, 4, 4)]
    public async Task Workspaces_expose_one_valid_editable_current_tip(
        string directory,
        string label,
        int objectCount,
        int relationCount,
        int completeArtifactCount)
    {
        var root = WorkspaceRoot(directory);
        using var service = CreateService(root);

        var workspace = await service.GetWorkspaceAsync(default);

        Assert.Equal("nativeArc", workspace.LineageKind);
        Assert.Equal("arc.yml", workspace.RelativeManifestPath);
        Assert.Empty(workspace.Findings!);
        var state = Assert.Single(workspace.States);
        Assert.Equal(label, state.Label);
        Assert.Equal(state.Id, workspace.DefaultStateId);
        Assert.Equal("valid", state.Status);
        Assert.True(state.Editable);
        Assert.Empty(state.Errors);
        Assert.Empty(state.CurationErrors!);
        Assert.Equal(objectCount, state.ObjectCount);
        Assert.Equal(relationCount, state.RelationCount);
        Assert.Equal(2, state.MappingArtifact!.MappingCount);
        Assert.Equal("valid", state.MappingArtifact.Status);

        var projection = await service.GetProjectionAsync(state.Id, default);
        Assert.Equal(objectCount, projection.Nodes.Count);
        Assert.Equal(relationCount, projection.Relations.Count);

        var native = new ProcessCoreInteropAdapter().Inspect(File.ReadAllBytes(Path.Combine(root, "arc.yml")));
        Assert.Equal(
            completeArtifactCount,
            native.Artifacts.Count(artifact => artifact.Selector is null && artifact.ArtifactType is "ArcIR state" or "SSSOM mapping set"));
    }

    [Fact]
    public async Task Flat_sample_exposes_both_local_string_assertions()
    {
        using var service = CreateService(WorkspaceRoot("s0-flat-sample"));
        var state = Assert.Single((await service.GetWorkspaceAsync(default)).States);
        var projection = await service.GetProjectionAsync(state.Id, default);
        var node = Assert.Single(projection.Nodes);
        Assert.Equal((Sample, "Sample", "observable"), (node.Id, node.Label, node.Kind));
        Assert.Equal([SampleType], node.TypeIds);
        Assert.Empty(projection.Relations);

        var detail = await Details(service, state.Id, Sample);
        AssertProperty(detail, "Name", "Sample", "string");
        AssertProperty(detail, "Genotype", "A+", "string", LocalGenotype, GenotypeAssertion);
        AssertProperty(detail, "Temperature", "30°C", "string", LocalTemperature, TemperatureAssertion);
    }

    [Fact]
    public async Task Genotype_workspace_exposes_source_process_sample_chain_and_genotype_annotation()
    {
        using var service = CreateService(WorkspaceRoot("s1-source-process"));
        var state = Assert.Single((await service.GetWorkspaceAsync(default)).States);
        var projection = await service.GetProjectionAsync(state.Id, default);

        AssertNodes(
            projection,
            (SourcePlant, "Source plant", "observable", PlantType),
            (Process, "Process", "activity", ProcessType),
            (Sample, "Sample", "observable", SampleType));
        AssertRelation(projection, InputRelation, Process, HasInput, "has_input", SourcePlant);
        AssertRelation(projection, FinalRelation, Process, HasOutput, "has_output", Sample);

        var source = await Details(service, state.Id, SourcePlant);
        AssertAnnotation(source, "genotype", "A+", Genotype, GenotypeAssertion);
        Assert.DoesNotContain(source.Properties, property => property.Id == GenotypeAssertion);
        var process = await Details(service, state.Id, Process);
        AssertProperty(process, "Name", "Process", "string", assertionId: ProcessNameAssertion);
        var sample = await Details(service, state.Id, Sample);
        Assert.DoesNotContain(sample.Properties, property => property.Id == GenotypeAssertion);
        AssertProperty(sample, "Temperature", "30°C", "string", LocalTemperature, TemperatureAssertion);
    }

    [Fact]
    public async Task Final_workspace_exposes_stable_extraction_and_unit_parameter_chain()
    {
        using var service = CreateService(WorkspaceRoot("s2-growth-extraction"));
        var state = Assert.Single((await service.GetWorkspaceAsync(default)).States);
        var projection = await service.GetProjectionAsync(state.Id, default);

        AssertNodes(
            projection,
            (SourcePlant, "Source plant", "observable", PlantType),
            (Growth, "Growth", "activity", ProcessType),
            (GrownPlant, "Grown plant", "observable", PlantType),
            (Process, "Extraction", "activity", ProcessType),
            (Sample, "Sample", "observable", SampleType));
        AssertRelation(projection, InputRelation, Growth, HasInput, "has_input", SourcePlant);
        AssertRelation(projection, GrowthOutputRelation, Growth, HasOutput, "has_output", GrownPlant);
        AssertRelation(projection, ExtractionInputRelation, Process, HasInput, "has_input", GrownPlant);
        AssertRelation(projection, FinalRelation, Process, HasOutput, "has_output", Sample);

        var growth = await Details(service, state.Id, Growth);
        var parameter = Assert.Single(growth.Annotations, annotation => annotation.Id == TemperatureAssertion);
        Assert.Equal(Temperature, parameter.PropertyId);
        Assert.Equal("temperature", parameter.PropertyLabel);
        Assert.Equal("literalWithUnit", parameter.Value.Type);
        Assert.Equal("30 °C", parameter.Value.Display);
        Assert.Equal("integer", parameter.Value.Literal!.Type);
        Assert.Equal("30", parameter.Value.Literal.Text);
        Assert.Equal(DegreeCelsius, parameter.Value.UnitId);

        var extraction = await Details(service, state.Id, Process);
        AssertProperty(extraction, "Name", "Extraction", "string", assertionId: ProcessNameAssertion);
        var source = await Details(service, state.Id, SourcePlant);
        AssertAnnotation(source, "genotype", "A+", Genotype, GenotypeAssertion);
        Assert.DoesNotContain(source.Properties, property => property.Id == GenotypeAssertion);
        var sample = await Details(service, state.Id, Sample);
        Assert.DoesNotContain(sample.Properties, property => property.Id == TemperatureAssertion);
    }

    [Theory]
    [InlineData("s0-flat-sample")]
    [InlineData("s1-source-process")]
    [InlineData("s2-growth-extraction")]
    public async Task Every_workspace_displays_the_same_two_literal_mapping_rows(string directory)
    {
        using var service = CreateService(WorkspaceRoot(directory));
        var state = Assert.Single((await service.GetWorkspaceAsync(default)).States);

        var mappings = await service.GetMappingsAsync(state.Id, default);

        Assert.Equal("1.1", mappings.SssomVersion);
        Assert.Equal("https://github.com/kMutagene/OverARC/mappings/sample-decomposition", mappings.MappingSetId);
        Assert.Equal("https://creativecommons.org/publicdomain/zero/1.0/", mappings.License);
        Assert.Collection(
            mappings.Mappings,
            row => AssertMapping(row, GenotypeRecord, LocalGenotype, "Genotype", Genotype, "genotype"),
            row => AssertMapping(row, TemperatureRecord, LocalTemperature, "Temperature", Temperature, "temperature"));
        Assert.DoesNotContain(mappings.Mappings, row => Field(row, "subject_label") is ["A+"] or ["30°C"]);
        Assert.DoesNotContain(mappings.Mappings, row => Field(row, "object_id").Contains(DegreeCelsius, StringComparer.Ordinal));
    }

    [Theory]
    [InlineData("s0-flat-sample", 2)]
    [InlineData("s1-source-process", 3)]
    [InlineData("s2-growth-extraction", 4)]
    public void Demo_artifacts_are_canonical_digest_bound_and_self_contained(string directory, int completeArtifactCount)
    {
        var root = WorkspaceRoot(directory);
        var arcPath = Path.Combine(root, "arc.yml");
        var arcBytes = File.ReadAllBytes(arcPath);
        var arcIr = new ArcIrInteropAdapter();
        var sssom = new SssomInteropAdapter();
        var processCore = new ProcessCoreInteropAdapter();

        Assert.Equal(arcBytes, processCore.EncodeCanonical(arcBytes));
        var native = processCore.Inspect(arcBytes);
        var complete = native.Artifacts
            .Where(artifact => artifact.Selector is null && artifact.ArtifactType is "ArcIR state" or "SSSOM mapping set")
            .ToArray();
        Assert.Equal(completeArtifactCount, complete.Length);

        var endpoints = native.Artifacts
            .Concat(native.Processes.SelectMany(process => new[] { process.Input, process.Output }).OfType<NativeArcArtifact>())
            .ToArray();
        foreach (var artifact in endpoints)
        {
            Assert.Matches("^[0-9a-f]{64}$", artifact.Sha256!);
            var path = ResolveContainedArtifact(root, artifact.Path);
            Assert.True(File.Exists(path), $"Declared artifact '{artifact.Path}' does not exist in '{directory}'.");
            var bytes = File.ReadAllBytes(path);
            Assert.Equal(Sha256(bytes), artifact.Sha256);

            if (artifact.Selector is null && artifact.ArtifactType == "ArcIR state")
            {
                Assert.Empty(arcIr.ValidateForEditing(bytes));
                Assert.Equal(bytes, arcIr.EncodeCanonical(bytes));
            }
            else if (artifact.Selector is null && artifact.ArtifactType == "SSSOM mapping set")
            {
                Assert.Empty(sssom.Validate(bytes));
                Assert.Equal(bytes, sssom.EncodeCanonical(bytes));
                Assert.Contains("#subject_type: rdfs literal", File.ReadAllText(path));
                Assert.Contains("#object_type: owl class", File.ReadAllText(path));
            }
        }
    }

    [Fact]
    public void Shared_predecessors_and_mapping_set_are_byte_identical()
    {
        var s0 = WorkspaceRoot("s0-flat-sample");
        var s1 = WorkspaceRoot("s1-source-process");
        var s2 = WorkspaceRoot("s2-growth-extraction");

        AssertFilesEqual(s0, s1, "arcir/states/Flat Sample.arcir.json");
        AssertFilesEqual(s0, s2, "arcir/states/Flat Sample.arcir.json");
        AssertFilesEqual(s1, s2, "arcir/states/Genotype externalized.arcir.json");
        AssertFilesEqual(s0, s1, "mappings/sample-decomposition.sssom.tsv");
        AssertFilesEqual(s0, s2, "mappings/sample-decomposition.sssom.tsv");
    }

    [Fact]
    public void Native_events_retain_exact_lineage_mapping_rows_and_structural_selectors()
    {
        var processCore = new ProcessCoreInteropAdapter();
        var selectors = new ArcIrInteropAdapter();
        var s0Root = WorkspaceRoot("s0-flat-sample");
        var s1Root = WorkspaceRoot("s1-source-process");
        var s2Root = WorkspaceRoot("s2-growth-extraction");
        var s0 = processCore.Inspect(File.ReadAllBytes(Path.Combine(s0Root, "arc.yml")));
        var s1 = processCore.Inspect(File.ReadAllBytes(Path.Combine(s1Root, "arc.yml")));
        var s2 = processCore.Inspect(File.ReadAllBytes(Path.Combine(s2Root, "arc.yml")));

        Assert.Empty(s0.Processes);
        Assert.Equal(7, s1.Processes.Count);
        Assert.Equal(17, s2.Processes.Count);
        Assert.All(s1.Processes, process => Assert.Equal(ExternalizeGenotype, process.Name));
        Assert.All(s2.Processes, process => Assert.True(process.Name is ExternalizeGenotype or ExternalizeTemperature));
        var firstEvent = s1.Processes.Where(process => process.Name == ExternalizeGenotype).ToArray();
        var retainedFirstEvent = s2.Processes.Where(process => process.Name == ExternalizeGenotype).ToArray();
        var secondEvent = s2.Processes.Where(process => process.Name == ExternalizeTemperature).ToArray();
        Assert.Equal(7, firstEvent.Length);
        Assert.Equal(7, retainedFirstEvent.Length);
        Assert.Equal(10, secondEvent.Length);
        Assert.Equal(
            firstEvent.Select(ProcessSignature).Order(StringComparer.Ordinal),
            retainedFirstEvent.Select(ProcessSignature).Order(StringComparer.Ordinal));

        AssertSuccession(
            firstEvent,
            FlatState,
            GenotypeState);
        AssertSuccession(
            secondEvent,
            GenotypeState,
            FinalState);

        var genotypeMapping = Assert.Single(firstEvent, process => process.ProcessType == "mapping application");
        AssertMappingInput(genotypeMapping, s1Root, LocalGenotype, Genotype, GenotypeRecord);
        AssertArcIrFragment(
            genotypeMapping.Output,
            GenotypeState,
            selectors.ObjectAnnotationSelector(SourcePlant, GenotypeAssertion),
            "ArcIR genotype annotation");
        AssertTransformation(genotypeMapping, "apply genotype term mapping");
        AssertFragmentLane(
            firstEvent,
            "moved fragment",
            (FlatState, selectors.PropertySelector(Sample, GenotypeAssertion), "ArcIR property assertion"),
            (GenotypeState, selectors.ObjectAnnotationSelector(SourcePlant, GenotypeAssertion), "ArcIR genotype annotation"),
            "move genotype assertion to Source plant annotation");
        AssertFragmentLane(
            firstEvent,
            "created fragment",
            null,
            (GenotypeState, selectors.ObjectSelector(SourcePlant), "ArcIR object"),
            "create Source plant observable");
        AssertFragmentLane(
            firstEvent,
            "created activity fragment",
            null,
            (GenotypeState, selectors.ObjectSelector(Process), "ArcIR object"),
            "create Process activity");
        AssertFragmentLane(
            firstEvent,
            "created input relation fragment",
            null,
            (GenotypeState, selectors.RelationSelector(InputRelation), "ArcIR relation"),
            "connect Process to Source plant with has_input");
        AssertFragmentLane(
            firstEvent,
            "created output relation fragment",
            null,
            (GenotypeState, selectors.RelationSelector(FinalRelation), "ArcIR relation"),
            "connect Process to Sample with has_output");

        var temperatureMapping = Assert.Single(secondEvent, process => process.ProcessType == "mapping application");
        AssertMappingInput(temperatureMapping, s2Root, LocalTemperature, Temperature, TemperatureRecord);
        AssertArcIrFragment(
            temperatureMapping.Output,
            FinalState,
            selectors.ObjectAnnotationSelector(Growth, TemperatureAssertion),
            "ArcIR unit parameter");
        AssertTransformation(temperatureMapping, "apply temperature term mapping");
        AssertFragmentLane(
            secondEvent,
            "removed fragment",
            (GenotypeState, selectors.PropertyValueSelector(Sample, TemperatureAssertion), "ArcIR string value"),
            null,
            "remove local Temperature literal");
        AssertFragmentLane(
            secondEvent,
            "moved fragment",
            (GenotypeState, selectors.PropertySelector(Sample, TemperatureAssertion), "ArcIR property assertion"),
            (FinalState, selectors.ObjectAnnotationSelector(Growth, TemperatureAssertion), "ArcIR unit parameter"),
            "move Temperature assertion to Growth");
        AssertFragmentLane(
            secondEvent,
            "created activity fragment",
            null,
            (FinalState, selectors.ObjectSelector(Growth), "ArcIR object"),
            "create Growth activity");
        AssertFragmentLane(
            secondEvent,
            "created fragment",
            null,
            (FinalState, selectors.ObjectSelector(GrownPlant), "ArcIR object"),
            "create Grown plant observable");
        AssertFragmentLane(
            secondEvent,
            "renamed fragment",
            (GenotypeState, selectors.PropertyValueSelector(Process, ProcessNameAssertion), "ArcIR object name"),
            (FinalState, selectors.PropertyValueSelector(Process, ProcessNameAssertion), "ArcIR object name"),
            "rename Process to Extraction while retaining its IRI");
        AssertFragmentLane(
            secondEvent,
            "rewired fragment",
            (GenotypeState, selectors.RelationSelector(InputRelation), "ArcIR relation"),
            (FinalState, selectors.RelationSelector(InputRelation), "ArcIR relation"),
            "rewire has_input relation from Process to Growth");
        AssertFragmentLane(
            secondEvent,
            "created growth relation fragment",
            null,
            (FinalState, selectors.RelationSelector(GrowthOutputRelation), "ArcIR relation"),
            "connect Growth to Grown plant with has_output");
        AssertFragmentLane(
            secondEvent,
            "created extraction relation fragment",
            null,
            (FinalState, selectors.RelationSelector(ExtractionInputRelation), "ArcIR relation"),
            "connect Extraction to Grown plant with has_input");

        Assert.DoesNotContain(s2.Processes, process =>
            process.ProcessType == "artifact succession"
            && process.Input?.ArtifactType == "SSSOM mapping set");
        Assert.All(s2.Processes.SelectMany(process => process.Parameters), annotation =>
        {
            Assert.Null(annotation.NameTan);
            Assert.Null(annotation.ValueTan);
        });
        Assert.All(s2.Processes.SelectMany(process => process.FormalParameters), parameter => Assert.Null(parameter.NameTan));
        var allArtifacts = s2.Artifacts
            .Concat(s2.Processes.SelectMany(process => new[] { process.Input, process.Output }).OfType<NativeArcArtifact>());
        Assert.All(allArtifacts.SelectMany(artifact => artifact.Annotations), annotation =>
        {
            Assert.Null(annotation.NameTan);
            Assert.Null(annotation.ValueTan);
        });
    }

    private static WorkspaceService CreateService(string root)
    {
        var interop = new ArcIrInteropAdapter();
        return new WorkspaceService(root, interop, new GraphProjectionBuilder(interop));
    }

    private static async Task<ElementDetailDto> Details(WorkspaceService service, string stateId, string objectId) =>
        Assert.IsType<ElementDetailDto>(await service.GetDetailsAsync(stateId, new DetailRequest("object", objectId), default));

    private static void AssertNodes(
        GraphProjectionDto projection,
        params (string Id, string Label, string Kind, string TypeId)[] expected)
    {
        Assert.Equal(expected.Length, projection.Nodes.Count);
        foreach (var (id, label, kind, typeId) in expected)
        {
            var node = Assert.Single(projection.Nodes, candidate => candidate.Id == id);
            Assert.Equal(label, node.Label);
            Assert.Equal(kind, node.Kind);
            Assert.Equal([typeId], node.TypeIds);
        }
    }

    private static void AssertRelation(
        GraphProjectionDto projection,
        string id,
        string subject,
        string predicateId,
        string label,
        string objectId)
    {
        var relation = Assert.Single(projection.Relations, value => value.Id == id);
        Assert.Equal(subject, relation.Subject);
        Assert.Equal(predicateId, relation.PredicateId);
        Assert.Equal(label, relation.Label);
        Assert.Equal(objectId, relation.Object);
        Assert.False(relation.IsDerived);
    }

    private static void AssertProperty(
        ElementDetailDto detail,
        string label,
        string display,
        string type,
        string? predicateId = null,
        string? assertionId = null)
    {
        var property = assertionId is null
            ? Assert.Single(detail.Properties, value => value.PredicateLabel == label)
            : Assert.Single(detail.Properties, value => value.Id == assertionId);
        Assert.Equal(label, property.PredicateLabel);
        Assert.Equal(display, property.Value.Display);
        Assert.Equal(type, property.Value.Type);
        if (predicateId is not null) Assert.Equal(predicateId, property.PredicateId);
    }

    private static void AssertAnnotation(
        ElementDetailDto detail,
        string label,
        string display,
        string propertyId,
        string annotationId)
    {
        var annotation = Assert.Single(detail.Annotations, value => value.Id == annotationId);
        Assert.Equal(propertyId, annotation.PropertyId);
        Assert.Equal(label, annotation.PropertyLabel);
        Assert.Equal("literal", annotation.Value.Type);
        Assert.Equal(display, annotation.Value.Display);
        Assert.Equal("string", annotation.Value.Literal!.Type);
        Assert.Equal(display, annotation.Value.Literal.Text);
    }

    private static void AssertMapping(
        SssomMappingView row,
        string recordId,
        string subjectId,
        string subjectLabel,
        string objectId,
        string objectLabel)
    {
        Assert.Equal([recordId], Field(row, "record_id"));
        Assert.Equal([subjectId], Field(row, "subject_id"));
        Assert.Equal([subjectLabel], Field(row, "subject_label"));
        Assert.Equal(["RdfsLiteral"], Field(row, "subject_type"));
        Assert.Equal([ExpandedExactMatch], Field(row, "predicate_id"));
        Assert.Equal([objectId], Field(row, "object_id"));
        Assert.Equal([objectLabel], Field(row, "object_label"));
        Assert.Equal(["OwlClass"], Field(row, "object_type"));
        Assert.Equal([ExpandedManualCuration], Field(row, "mapping_justification"));
        Assert.Equal(["https://github.com/kMutagene/OverARC"], Field(row, "creator_id"));
        Assert.Equal(["OverARC"], Field(row, "creator_label"));
    }

    private static IReadOnlyList<string> Field(SssomMappingView row, string name) =>
        Assert.Single(row.Fields, field => field.Name == name).Values;

    private static string ResolveContainedArtifact(string root, string relativePath)
    {
        var resolvedRoot = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(root, relativePath.Replace('/', Path.DirectorySeparatorChar)));
        Assert.StartsWith(resolvedRoot, path, StringComparison.OrdinalIgnoreCase);
        return path;
    }

    private static void AssertFilesEqual(string leftRoot, string rightRoot, string relativePath) =>
        Assert.Equal(
            File.ReadAllBytes(ResolveContainedArtifact(leftRoot, relativePath)),
            File.ReadAllBytes(ResolveContainedArtifact(rightRoot, relativePath)));

    private static void AssertSuccession(
        IReadOnlyList<NativeArcProcess> processes,
        string inputPath,
        string outputPath)
    {
        var lane = Assert.Single(processes, process => process.ProcessType == "artifact succession");
        Assert.Equal(inputPath, lane.Input!.Path);
        Assert.Equal("ArcIR state", lane.Input.ArtifactType);
        Assert.Equal("application/json", lane.Input.EncodingFormat);
        Assert.Null(lane.Input.Selector);
        Assert.Null(lane.Input.SelectorFormat);
        Assert.Equal(outputPath, lane.Output!.Path);
        Assert.Equal("ArcIR state", lane.Output.ArtifactType);
        Assert.Equal("application/json", lane.Output.EncodingFormat);
        Assert.Null(lane.Output.Selector);
        Assert.Null(lane.Output.SelectorFormat);
        AssertTransformation(lane, "publish immutable ArcIR successor");
    }

    private static void AssertFragmentLane(
        IReadOnlyList<NativeArcProcess> processes,
        string processType,
        (string Path, string Selector, string ArtifactType)? input,
        (string Path, string Selector, string ArtifactType)? output,
        string transformation)
    {
        var lane = Assert.Single(processes, process => process.ProcessType == processType);
        AssertArcIrFragment(lane.Input, input);
        AssertArcIrFragment(lane.Output, output);
        AssertTransformation(lane, transformation);
    }

    private static void AssertArcIrFragment(
        NativeArcArtifact? actual,
        (string Path, string Selector, string ArtifactType)? expected)
    {
        if (expected is null)
        {
            Assert.Null(actual);
            return;
        }

        AssertArcIrFragment(actual, expected.Value.Path, expected.Value.Selector, expected.Value.ArtifactType);
    }

    private static void AssertArcIrFragment(
        NativeArcArtifact? actual,
        string path,
        string selector,
        string artifactType)
    {
        Assert.NotNull(actual);
        Assert.Equal(path, actual.Path);
        Assert.Equal(selector, actual.Selector);
        Assert.Equal(JsonPointer, actual.SelectorFormat);
        Assert.Equal(artifactType, actual.ArtifactType);
        Assert.Equal("application/json", actual.EncodingFormat);
    }

    private static void AssertTransformation(NativeArcProcess process, string expected)
    {
        var annotation = Assert.Single(process.Parameters, value => value.Name == "curation transformation");
        Assert.Equal(expected, annotation.Value);
    }

    private static void AssertMappingInput(
        NativeArcProcess process,
        string workspaceRoot,
        string subjectId,
        string objectId,
        string recordId)
    {
        var input = process.Input!;
        Assert.Equal(MappingSet, input.Path);
        Assert.Equal("SSSOM mapping record", input.ArtifactType);
        Assert.Equal("text/tab-separated-values", input.EncodingFormat);
        Assert.StartsWith("#row=", input.Selector!, StringComparison.Ordinal);
        Assert.Equal(TsvRowSelector, input.SelectorFormat);
        var rowNumber = int.Parse(input.Selector!["#row=".Length..], System.Globalization.CultureInfo.InvariantCulture);
        var mappingPath = ResolveContainedArtifact(workspaceRoot, input.Path);
        var document = new SssomInteropAdapter().InspectDocument(File.ReadAllBytes(mappingPath));
        var row = document.Mappings[rowNumber - 2];
        Assert.Equal([subjectId], Field(row, "subject_id"));
        Assert.Equal([objectId], Field(row, "object_id"));
        Assert.Equal([recordId], Field(row, "record_id"));
        Assert.Contains(input.Annotations, annotation => annotation.Name == "record id" && annotation.Value == recordId);
        Assert.Contains(input.Annotations, annotation => annotation.Name == "mapping predicate" && annotation.Value == ExactMatch);
        Assert.Contains(input.Annotations, annotation => annotation.Name == "target term" && annotation.Value == objectId);
    }

    private static string ProcessSignature(NativeArcProcess process) => string.Join(
        "|",
        process.Name,
        process.ProcessType,
        ArtifactSignature(process.Input),
        ArtifactSignature(process.Output),
        string.Join(",", process.Parameters.Select(annotation => $"{annotation.Name}={annotation.Value}").Order(StringComparer.Ordinal)));

    private static string ArtifactSignature(NativeArcArtifact? artifact) => artifact is null
        ? "-"
        : $"{artifact.Path}#{artifact.Selector}|{artifact.ArtifactType}|{artifact.Sha256}";

    private static string WorkspaceRoot(string directory) => Path.Combine(DemoRoot, directory);

    private static string Sha256(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
}
