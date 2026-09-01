# Sample decomposition conference demo

> **Status: screenshot milestone implemented and verified on Windows; Linux CI
> pending.** `Dev --workspace` and the three independently launchable workspaces
> are complete. Structural authoring follows later. Git-backed history traversal
> remains explicitly deferred.

## Goal and current boundary

Create a conference-ready demonstration that progressively decomposes one flat
Sample into an explicit experimental-process graph while preserving canonical
ArcIR, SSSOM mappings, and native ProcessCore provenance.

OverARC already supports Graph, Table, Terms, Mappings, and unsaved Changes
views; complete inspectors and filtering; draft replay and undo; and atomic
publication of a selected literal-to-term mapping. It cannot yet create objects
or activities, move or delete assertions, create or rewire relations, rename
objects, or author typed parameters. The first deliverable therefore uses
prebuilt workspaces rather than new editing functionality.

No history API, history transport fields, History view, Git integration, or
in-app workspace picker is part of this plan. Future state traversal will be
designed around Git separately.

## Priority 1 — Select a workspace when starting development

Extend the FAKE development entry point with an optional workspace argument:

```powershell
.\build.cmd Dev --workspace examples\sample-decomposition\s0-flat-sample
```

```bash
./build.sh Dev --workspace examples/sample-decomposition/s0-flat-sample
```

- Accept `--workspace <path>` for the `Dev` target.
- Resolve relative paths against the repository root and accept absolute paths.
- Validate the directory before starting either the API or Vite child process.
- Fail clearly for a missing value, an unknown option, or a missing directory.
- Preserve `examples/viewer-workspace` as the default when the option is absent.
- Forward the resolved path to the API's existing `--workspace` argument.
- Preserve path values containing spaces through `ProcessStartInfo.ArgumentList`.
- Keep `npm run dev` Vite-only; do not add workspace handling to npm or React.

The current FAKE `Dev` target starts API `dotnet watch` and Vite as sibling
processes with inherited, unprefixed console streams. Their logs are therefore
interleaved. Plain `npm run dev` starts only Vite, ProcessCore remains a NuGet
dependency rather than a watched project, and this milestone does not change
development-log routing.

## Priority 2 — Three screenshot workspaces

Create three independent native workspace roots:

- `examples/sample-decomposition/s0-flat-sample`
- `examples/sample-decomposition/s1-source-process`
- `examples/sample-decomposition/s2-growth-extraction`

Each workspace exposes exactly one current ArcIR state through the existing
current-tip discovery behavior.

| Project | Visible state         | Content graph                                             |
| ------- | --------------------- | --------------------------------------------------------- |
| S0      | Flat Sample           | one Sample object and no relations                        |
| S1      | Genotype externalized | Source plant → Process → Sample                           |
| S2      | Growth and extraction | Source plant → Growth → Grown plant → Extraction → Sample |

### State definitions

- **S0:** one Sample `Observable` with local `Genotype = "A+"` and
  `Temperature = "30°C"` string assertions.
- **S1:** remove Genotype from Sample; create a Source plant `Observable` with
  the mapped object annotation `genotype = "A+"`; create an `Activity` named
  Process; connect Source plant → Process → Sample. Sample retains Temperature.
- **S2:** remove Temperature from Sample; create a Growth `Activity` with integer
  value `30` and unit `UO:0000027`; create a Grown plant `Observable`; retain the
  existing Process activity IRI while renaming it Extraction; rewire the final
  chain.

The Sample and Process/Extraction IRIs remain stable across revisions. ArcIR
objects and ArcRelations appear in Sigma. `A+` and `30 °C` remain assertion or
parameter content shown in inspectors rather than separate graph nodes.

### Self-contained provenance

- S0 contains the root ArcIR artifact.
- S1 contains byte-identical S0 plus S1 and the S0→S1 ProcessCore curation event.
- S2 contains byte-identical S0 and S1 plus S2 and both ProcessCore events.
- Each workspace is self-contained because declared native artifact paths may
  not escape the workspace root.
- Shared predecessors and mapping files have byte-identical canonical encodings
  and digests across their containing workspaces.

Create one immutable SSSOM mapping set and copy its identical canonical bytes to
all three workspaces:

| Local field                         | External target              | Mapping predicate |
| ----------------------------------- | ---------------------------- | ----------------- |
| `urn:overarc:demo:term:genotype`    | `GENO:0000222` (`genotype`)  | `skos:exactMatch` |
| `urn:overarc:demo:term:temperature` | `PATO:0000146` (temperature) | `skos:exactMatch` |

Define the local terms equivalently to their targets and record
`semapv:ManualMappingCuration`. Keep `A+` as an unmapped fictional genotype code.
Register degree Celsius directly as `UO:0000027`; never map the complete
`"30°C"` literal to the unit term.

Record two native curation events:

1. `Externalize genotype` consumes the exact genotype SSSOM row and records
   whole-artifact S0→S1 succession plus changed-fragment selectors.
2. `Insert growth and externalize temperature` consumes the exact temperature
   row and records whole-artifact S1→S2 succession plus created, removed, moved,
   renamed, and rewired fragment selectors.

The unchanged mapping set receives no artificial SSSOM successor. Novel
structural operations use descriptive ProcessCore transformation labels without
speculative CTRO identifiers. Generate and canonicalize ArcIR, SSSOM, and
`arc.yml` through the pinned core packages and dedicated adapters rather than
hand-maintaining competing formats.

### Screenshot acceptance

1. Launch S0 and capture the Graph with Sample selected and both fields visible.
2. Launch S1 and capture Source plant → Process → Sample with Source plant
   selected and `A+` visible.
3. Launch S2 and capture the final five-object chain with Growth selected and its
   `30 °C` parameter visible.
4. Confirm Mappings displays both field mapping rows in each workspace.
5. Use Reset layout before capture so the starting coordinates are reproducible.

Document one `Dev --workspace` command per workspace.

## Implemented screenshot milestone

- `Dev --workspace <path>` accepts repository-relative and absolute paths,
  validates arguments and the directory before child-process startup, and keeps
  the original viewer workspace as its default.
- S0, S1, and S2 are checked in as independent native ARC roots with one valid,
  editable current tip apiece, canonical ArcIR/SSSOM/ProcessCore bytes, and
  digest-bound local provenance endpoints.
- The Graph view defaults to an uncluttered label-free canvas, exposes one
  show/hide-all-labels control, and keeps its camera, layout, label, and PNG
  controls together at the lower left of the graph pane.
- Browse mode hides literal-mapping actions. An explicit curation-mode toggle
  reveals them for the active editable state and exits automatically when the
  selected state changes.
- Automated API tests cover the exact graphs, stable IDs, assertions, unit
  parameter, mappings, shared bytes, canonical encodings, artifact containment,
  digests, event membership, selectors, and descriptive transformation labels.

Windows verification on 2026-09-01 passed Prettier, `git diff --check`, focused
demo tests (14/14), valid `Dev` launches with default, relative, absolute, and
space-containing paths, eager invalid-argument failures, and the repository
`Format`, `Build`, `Test`, and `Publish` gates. The full Test gate passed 66 API
tests, 42 frontend/performance tests, 12 viewer browser tests, and 2 curation
browser tests. The configured Linux CI gate remains pending.

## Later milestone — Structural authoring through the UI

Add immutable structural transformations upstream in BioFSharp.ArcIR, publish a
new package release, and consume them only through `ArcIrInteropAdapter`.

Required core primitives:

- create an `Observable` or `Activity`;
- move and map one exact assertion occurrence;
- rename an object while preserving its IRI;
- create, repoint, and remove exact ArcRelations;
- set a numeric parameter with an ontology-backed unit; and
- return exact input and output selectors for provenance.

Expose atomic grouped draft operations at
`POST /api/v1/drafts/{draftId}/operation-groups`. The operation union contains
`createObject`, `moveMappedAssertion`, `renameObject`, `createRelation`,
`repointRelation`, and `setUnitParameter`. The server mints stable IDs when a
group is appended. Every operation carries the expected source selector and
content plus the optimistic draft revision. Replay and validation are atomic;
undo removes the complete group. Preserve the existing literal-mapping endpoint.

Add two guided workflows:

1. **Externalize Genotype** creates Source plant and Process, moves and maps the
   Genotype assertion into a Source plant annotation, creates both relations,
   and publishes S1 on Save.
2. **Insert Growth** creates Growth and Grown plant, moves, maps, and parses
   Temperature, renames Process to Extraction, rewires the graph, and publishes
   S2 on Save.

Reuse the existing Graph, Table, Inspector, Mappings, Changes, replay, undo,
conflict, Save/Discard/Stay, atomic publication, and recovery behavior. Ontology
lookup and term creation remain deferred because all conference terms and
mappings are pre-registered.

## Verification and assumptions

Verify:

- `Dev` with no option, relative paths, absolute paths, paths containing spaces,
  a missing option value, unknown options, and nonexistent directories;
- one valid current state per demo workspace;
- exact S0/S1/S2 object, relation, assertion, parameter, label, and stable-ID
  contents;
- byte-identical shared predecessor and SSSOM artifacts;
- canonical re-encoding, declared SHA-256 bindings, SSSOM rows, ProcessCore
  events, and exact selectors;
- Graph, Inspector, and Mappings content required for every screenshot; and
- repository-wide Format, Build, Test, and Publish gates on Windows, followed by
  the configured Linux CI gate.

Assumptions:

- `A+` is explicitly presented as a fictional genotype code. If it represents
  ABO/Rh-positive blood type, it must instead be modelled as a phenotype.
- The existing `examples/viewer-workspace` remains unchanged.
- No viewer action writes Git, and no Git-backed traversal is implemented here.
- Matching the slide illustrations with standalone oval value nodes would
  require a separate view-only assertion overlay and is outside this plan.
