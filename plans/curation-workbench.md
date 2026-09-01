# Selected literal-to-term curation workbench

> **Status: implementation complete; stable NuGet migration verified on Windows (Steps 1–8 complete; Linux CI pending).** This is the next OverARC milestone after the read-only
> graph, table, and term workbench. Dependency and editable-workspace foundations are implemented. Before every
> implementation commit, update this status and the status of each affected step
> so the plans describe exactly what the commit contains and verifies.
>
> The implemented successor screenshot milestone is the
> [Sample decomposition conference demo](sample-decomposition-conference-demo.md),
> which delivers three launchable screenshot workspaces before general
> structural authoring. Git-backed history traversal remains deferred.

## Goal

Add the first authoritative graph edit: map one selected string literal
occurrence in an immutable ArcIR state to a registered term. The edit produces a
new ArcIR state, records or reuses the corresponding SSSOM mapping, and publishes
native ARC process provenance. Draft edits remain local and undoable until the
curator explicitly saves them.

This milestone establishes the transaction boundary for later edits. It must not
introduce JSON Patch, mutate an existing ArcIR or SSSOM artifact, write Git, or
store lineage in `.overarc/viewer.json`.

## Confirmed decisions

### Dependency and ownership boundaries

- ArcIR decoding, canonical encoding, selectors, validation, and the
  format-neutral selected-literal transformation belong to
  `BioFSharp.ArcIR`.
- SSSOM decoding, validation, editing, and canonical encoding use
  `PolyglotSSSOM`.
- Native ARC provenance uses `ProcessCore` and its `arc.yml` codec. This is not
  ISA/ARCtrl provenance.
- OverARC owns draft orchestration, HTTP contracts, workspace publication,
  recovery, and curator UI behavior.
- Only dedicated C# interop adapters may expose F# library representations.
  HTTP DTOs and TypeScript contracts remain ordinary transport types.
- OverARC consumes exact stable NuGet versions: `BioFSharp.ArcIR` `0.3.0`,
  `PolyglotSSSOM` `0.1.0`, and `ProcessCore` `0.1.3`.
- Local development, the devcontainer, and CI restore those packages directly.
  They do not require dependency source checkouts or root environment variables.

### Workspace and lineage

- An edit-enabled workspace is discovered from native `arc.yml`. It is the
  authority for state, mapping-artifact, and process lineage.
- `.overarc/viewer.json` remains application configuration and a compatibility
  input for legacy read-only workspaces. Curation never writes it and never
  interprets it as provenance.
- Existing legacy manifest-only workspaces remain browseable but are explicitly
  read-only.
- Every editable ArcIR state has a current, valid SSSOM 1.1 mapping artifact.
  The example workspace receives a canonical empty mapping set licensed under
  CC0 1.0 rather than manufacturing defaults when the first edit is saved.
- All paths remain below the workspace, may not traverse reparse points or
  symbolic links, and are bound to exact artifact digests.

### First edit semantics

- The source is one selected occurrence addressed by a typed ArcIR JSON selector.
- Supported sources are string-valued object properties, relation properties,
  and literal annotations, including property annotations.
- List members and non-string scalar values are out of scope for this milestone.
- The target must be a term already registered in the active ArcIR state's
  `graph.terms` dictionary. Ontology lookup and term creation are deferred.
- Applying the edit preserves the original literal and adds the deterministic
  ArcIR semantic companion defined by the core transformation. It does not
  perform a broad search-and-replace or partially mutate a graph.
- The mapping predicate is selected from:
  - `skos:exactMatch` (default)
  - `skos:closeMatch`
  - `skos:broadMatch`
  - `skos:narrowMatch`
  - `skos:relatedMatch`
- An exact existing SSSOM record for the literal, predicate, and target is reused
  and the mapping artifact remains byte-equivalent. A different target for the
  same literal is allowed and shown to the curator; batch ambiguity policy is
  deferred.
- A new literal mapping record has:
  - no `subject_id`;
  - the exact literal in `subject_label`;
  - `subject_type` set to the RDFS literal entity type;
  - the registered term IRI and label in `object_id` and `object_label`;
  - the chosen SKOS predicate;
  - `semapv:ManualMappingCuration` as mapping justification;
  - a generated URI `record_id`, using a `urn:uuid:` value;
  - OverARC as the default creator, identified by
    `https://github.com/kMutagene/OverARC` and labelled `OverARC`; and
  - the UTC save date as `mapping_date`.
- Confidence, comments, reviewer identity, and arbitrary extension authoring are
  not in the first dialog. Loaded fields and extensions are preserved and may be
  displayed in the Mappings view.

### Draft and save model

- The server owns an in-memory draft based on immutable ArcIR and SSSOM artifact
  digests. A draft contains typed operations, a monotonically increasing
  revision, recomputed ArcIR and SSSOM bytes, findings, and one process name.
- The browser keeps only the draft identifier in `sessionStorage`, allowing a
  page reload to reattach while the server lives. Drafts expire after 24 hours of
  inactivity and are intentionally lost on server restart in this milestone.
- Undo removes a typed operation and replays the remaining operations from the
  immutable base. It never relies on inverse JSON patches.
- Graph, Table, Terms, and Inspector render the draft projection while a draft is
  active and show an unsaved indicator.
- One saved draft publishes one successor ArcIR artifact and, only if mappings
  changed, one successor SSSOM artifact. Original artifacts are never overwritten.
- The UI presents one curation process containing N operations. The adapter may
  emit the multiple `Process` instances required by ProcessCore's singular
  input/output lanes, but every instance for that save uses the same process name
  so the native YAML groups the compatible lanes.
- The process name is generated once per draft as
  `overarc-curation-<UUIDv7>`.
- Native provenance covers the complete predecessor/successor artifacts, exact
  selected ArcIR fragments, the exact SSSOM record used or created, the curator,
  and the save time. Creating a reusable mapping and applying it to an ArcIR
  occurrence remain distinguishable provenance acts even though they belong to
  the same named curation process.
- The curation parameter is a ProcessCore `FormalParameter` named
  `curation transformation`, with `nameTAN=CTRO:0000000`. A literal-to-term
  operation records a value labelled `literal-to-term mapping application` with
  `valueTAN=CTRO:0000007`.
- Saving is local only. Git commit/push and DataHub publication are deferred.

## Implementation steps and acceptance gates

### Step 1 — Establish dependency and editable-workspace foundations _(implemented 2026-08-28)_

Consume stable NuGet packages for PolyglotSSSOM, ProcessCore, and
BioFSharp.ArcIR behind dedicated interop adapters. Keep the devcontainer, CI,
build documentation, and repository architecture free of dependency-source
checkout assumptions. Create an edit-enabled test workspace and evolve the
example workspace to contain native `arc.yml`, immutable ArcIR state artifacts,
and a valid empty SSSOM 1.1 mapping set. Preserve a legacy manifest-only fixture.

**Acceptance gate**

Windows restore, formatting, build, test, and publish gates pass. Linux CI
restores the same exact package versions and awaits its next pushed run.

- The solution restores and builds on Windows and Linux using NuGet.org.
- CI restores the exact dependency package versions declared by the active plan.
- OverARC contains no copied ArcIR, SSSOM, or ProcessCore domain model.
- F# types do not cross the adapter/DTO boundary.
- The native fixture is edit-capable and the legacy fixture remains read-only.
- No dependency source checkout or upstream source change is required.
- The affected plan status is updated before the foundation commit.

### Step 2 — Add the selected-literal ArcIR core transformation _(implemented 2026-08-28)_

In BioFSharp.ArcIR, add inverse parsing from a supported typed JSON selector to
an `ArcJsonLocation`, then add a format-neutral selected-literal mapping
operation. It must validate the addressed occurrence, preserve the source
literal, add the deterministic semantic companion, and return the exact output
location plus typed conflicts or validation failures. It must not depend on
SSSOM, CTRO, ProcessCore, HTTP, or OverARC.

Cover object properties, relation properties, literal annotations, nested
property annotations, escaped selector segments, missing locations, wrong value
kinds, already-applied mappings, and conflicting companions.

**Acceptance gate**

- Every selector emitted for a supported literal occurrence round-trips to the
  intended typed location.
- Applying the same compatible operation is deterministic and does not duplicate
  the companion.
- Invalid or conflicting operations return typed failures without returning a
  partially modified graph.
- Canonical encode/decode and validation succeed for the transformed state.
- The upstream BioFSharp authoritative plan and API documentation describe the
  implemented primitive before its commit.

The core transformation is implemented without application-layer dependencies.
Its focused 47-test suite and the complete BioFSharp `RunTests` gate (235 tests,
dependency audit, and generated-artifact verification) pass on Windows.

### Step 3 — Add native state and mapping lineage discovery _(implemented 2026-08-28)_

Introduce a workspace-provider boundary with native ARC and legacy manifest
implementations. Decode `arc.yml` through ProcessCore, resolve complete ArcIR and
SSSOM artifact revisions, verify safe paths and digests, and expose which states
are editable. Keep invalid entries independently inspectable. Load and validate
SSSOM through PolyglotSSSOM and retain unknown supported fields/extensions.

**Acceptance gate**

- Native discovery selects current artifacts only from declared ARC lineage, not
  modification time, manifest order, or initial UI selection.
- Unsafe paths, symlink/reparse traversal, missing files, digest mismatches,
  ambiguous lineage, invalid ArcIR, and invalid SSSOM are rejected independently
  with actionable findings.
- Existing read-only workspace and API behavior remains compatible.
- Editing is unavailable unless the selected state has an unambiguous valid
  ArcIR base and SSSOM base.
- Discovery performs no workspace writes.

Native and legacy workspace providers now preserve the original browsing API
while reporting native editability separately from ArcIR validity. ProcessCore
lineage, path and digest safety, independent ArcIR/SSSOM failures, SSSOM 1.1 and
extension retention, branching ambiguity, and no-write discovery are covered by
backend tests. The full OverARC gate passes on Windows: 28 backend tests, 32
frontend tests, and 12 Chromium/Firefox browser tests.

### Step 4 — Implement server-owned drafts, replay, and undo _(implemented 2026-08-28)_

Add a draft service whose typed command records the source selector, exact
literal, target term IRI, predicate, and expected revision. Recompute the draft
from immutable base artifacts after every add/remove operation. Use the core
ArcIR transformation and PolyglotSSSOM adapter to create or reuse mapping rows.
Return draft findings rather than writing invalid state.

Use optimistic concurrency on every mutation. A stale expected revision returns
`409`. Base-digest changes also invalidate the draft with `409`. Expired or
unknown drafts return `404`.

**Acceptance gate**

- Replay produces byte-equivalent draft artifacts for the same ordered commands.
- Removing any operation and replaying yields the expected ArcIR and SSSOM state.
- Exact mapping reuse causes no SSSOM content change; new mappings receive stable
  record IDs within the draft.
- Multiple targets for the same literal remain visible and do not silently
  overwrite each other.
- Draft creation, mutation, projection, undo, expiry, and conflict paths are
  covered by unit and integration tests.
- No draft action writes workspace files.

The in-memory draft service now owns stable UUIDv7 command and mapping identities,
optimistic revisions, 24-hour inactivity expiry, typed ArcIR/SSSOM replay, exact
mapping reuse, undo, and draft projections. It refreshes native discovery before
access so changed bases conflict without partial mutation. The full Windows gate
passes with 33 backend tests, 32 frontend tests, and 12 Chromium/Firefox browser
tests; workspace-byte invariance is asserted during draft tests.

### Step 5 — Implement validated atomic local save _(implemented 2026-08-28)_

Under an exclusive workspace lock, replay and validate the draft again, encode
canonical ArcIR, SSSOM, and `arc.yml`, calculate their digests, and construct the
native ProcessCore provenance. Stage all output on the same filesystem. Publish
immutable artifacts with create-new semantics, then atomically replace
`arc.yml` last as the semantic commit point.

Use a private `.overarc` recovery journal strictly as an interrupted-save
mechanism, not as provenance. On startup or before another save, recovery either
finishes a prepared publication whose bytes and digests match or removes
unreferenced staged outputs. Never alter a predecessor artifact.

After a successful save, clear the draft, refresh the native catalog, and select
the successor state.

**Acceptance gate**

- Validation errors block publication and are returned as structured findings.
- A successful save creates exactly one ArcIR successor and creates a SSSOM
  successor only when mapping content changed.
- Every ProcessCore process lane for the save has the same draft process name and
  round-trips through canonical `arc.yml`.
- The native graph can answer: predecessor and successor artifact revisions,
  selected input and output fragments, exact mapping record used or created,
  curator, save time, and CTRO transformation type.
- Fault-injection tests at each staging/publication boundary prove that the old
  `arc.yml` remains authoritative or recovery completes the new publication.
- Existing artifacts, `.overarc/viewer.json`, and Git are unchanged.
- Concurrent saves are serialized and stale drafts cannot publish.

The save service now holds an in-process and OS-level workspace lock through
save-time replay, canonical validation, same-filesystem staging, create-new
artifact publication, and the final atomic `arc.yml` replacement. ProcessCore
records complete succession and exact selected ArcIR/SSSOM fragments under the
draft's shared process name with curator, UTC save time, and CTRO annotations.
The private digest-bound recovery journal completes valid preparations or removes
only application-owned uncommitted outputs. Eleven focused save tests cover exact
mapping reuse, structured validation, all six fault boundaries, corrupted staging,
predecessor/viewer/Git invariance, stale revisions, and concurrent saves. The full
Windows gates pass with 46 backend tests, 32 frontend tests, 12 Chromium/Firefox
browser tests, and a successful packaged publish.

### Step 6 — Expose the draft HTTP contract _(implemented 2026-08-28)_

Add hand-written `/api/v1` contracts for:

- `GET /api/v1/states/{stateId}/mappings`
- `POST /api/v1/states/{stateId}/drafts`
- `GET /api/v1/drafts/{draftId}`
- `DELETE /api/v1/drafts/{draftId}`
- `GET /api/v1/drafts/{draftId}/projection`
- `POST /api/v1/drafts/{draftId}/details`
- `POST /api/v1/drafts/{draftId}/term-details`
- `GET /api/v1/drafts/{draftId}/mappings`
- `POST /api/v1/drafts/{draftId}/literal-term-mappings`
- `DELETE /api/v1/drafts/{draftId}/operations/{operationId}`
- `POST /api/v1/drafts/{draftId}/save`

Mutation requests carry the expected draft revision. Keep exact selectors, IDs,
64-bit integers, and canonical floating values lossless. Findings are transport
DTOs, not raw library values.

**Acceptance gate**

- OpenAPI documents every request, response, revision precondition, and problem
  response.
- Unknown resources use `404`, stale revisions/base states use `409`, and invalid
  operations or saves use RFC 7807 `422` responses with structured findings.
- No F# option, result, union, map, or record crosses the HTTP boundary.
- Contract and integration tests cover the complete successful flow and every
  documented failure class.

The hand-written curation API now exposes all eleven state/draft routes with
explicit OpenAPI success and problem responses. Dedicated HTTP DTOs encode
64-bit revisions as decimal strings, and the shared client retains structured
RFC 7807 findings. Draft Graph, Table, Terms, Inspector, and Mappings reads use
replayed artifacts; state mappings expose populated standard and extension
fields through ordinary adapter projections. Integration tests cover create,
reattach, add, every draft projection, undo, discard, save, legacy read-only
behavior, and the `404`/`409`/`422` classes. All 51 backend contract tests, 32
frontend tests, and the Chromium regression pass. The final Step 8 gate will
rerun Firefox after a host-level pre-navigation browser-start failure observed
under local resource pressure.

### Step 7 — Add Mappings, Changes, and the first edit interaction

Add `Mappings` and `Changes` to the existing center-view selector. Mappings shows
the active mapping-set metadata and records, including preserved loaded fields.
Changes shows the current draft's ordered operations and supports undo; committed
history is not part of this slice.

For supported string occurrences, add a `Map to term` action in the Inspector.
Keep those actions hidden in the default browse mode and expose them only after
the curator explicitly enters curation mode for the active editable state. The
dialog searches only the active state's registered term dictionary, shows exact
source literal and selector context, offers the five predicate choices, warns
about mappings to other targets, and submits a typed draft operation.

Render all existing exploration views from the draft projection, show the
process-level unsaved status, and store the draft ID in `sessionStorage`. On state
switch or navigation away from a dirty draft, offer Save, Discard, and Stay.

**Acceptance gate**

- A curator can select an occurrence, choose a registered term and predicate,
  inspect the changed graph/table/term/inspector views, review the mapping and
  operation, undo it, and save it without losing exact IDs.
- Reload reattaches to a live server draft; an expired or server-lost draft is
  explained and cleanly removed from browser state.
- State switching cannot silently discard or save changes.
- Mapping and Changes views are keyboard reachable; the dialog has correct focus
  management, labels, errors, escape/cancel behavior, and no graph-only path.
- Production components, hooks, types, services, and meaningful helpers have
  current declaration documentation.

The workbench now offers first-class Mappings and Changes center views, exact
occurrence mapping actions gated by an explicit curation mode in the Inspector,
a registered-term-only accessible dialog, process-level draft status,
replay-based undo, and Save/Discard/Stay state switch protection. Every
exploration surface follows the current draft; only the
server-issued draft ID is retained in `sessionStorage`, with explicit live
reattach and lost-draft handling. Component and hook coverage verifies dialog
focus/cancel/error behavior, supported occurrence actions, generic SSSOM fields,
ordered commands, exact optimistic revisions, reattachment, and loss recovery.
The dedicated temporary-workspace browser flow covers the complete interaction
in Chromium and Firefox and also caught and fixed duplicate-content successor
selection by matching the published path and digest rather than assuming digests
are unique across ArcIR branches.

### Step 8 — Verify the complete curation slice

Run repository-wide formatting, build, unit, integration, and browser suites
through FAKE. Browser tests use temporary copies of the editable fixture so no
checked-in example or test workspace is mutated. Exercise both Chromium and
Firefox and inspect the published files, not only API responses.

**Acceptance gate**

- Chromium and Firefox cover create draft, add mapping, live draft projection,
  reload/reattach, undo, Save/Discard/Stay, successful save, and blocked invalid
  or stale saves.
- Post-save assertions decode and validate the successor ArcIR, successor or
  reused SSSOM, and canonical `arc.yml`; verify exact selectors and record IDs;
  and prove predecessor bytes are unchanged.
- Recovery and concurrent-save tests pass on supported platforms.
- `build.cmd Format`, `build.cmd Build`, and `build.cmd Test` pass on Windows;
  their Linux equivalents pass in CI.
- Dependency pins, architecture documentation, AGENTS guidance, and every
  affected plan status match the implementation included in the final commit.

The complete Windows gate now passes through the FAKE entry point using the
stable NuGet dependency graph: `Format`, `Build`, and `Test`, with 52 backend
tests, 40 frontend unit/performance tests, 12 Chromium/Firefox viewer regressions,
and two serial Chromium/Firefox curation-publication scenarios. Those curation
scenarios build temporary copies of the editable fixture, cover
create/add/replayed views/reload/undo and Save/Discard/Stay, prove invalid and
stale saves are blocked, inspect successor ArcIR and SSSOM bytes plus canonical
`arc.yml`, and verify predecessor bytes. Recovery, concurrency, exact mapping
reuse, and sequential duplicate-content branch publication are covered in the
backend suite. The packaged `Publish` target also succeeds. Linux verification
remains assigned to the configured CI workflow once this commit is pushed to a
CI-visible branch. Vite excludes backend-owned `.overarc` runtime state from
frontend file watching so the exclusive Windows publication lock cannot
terminate the development server.

## Deferred work

- Git commit/push, DataHub synchronization, remote locking, and publication.
- Persisted or multi-user drafts, authentication, and curator identity UI.
- Ontology lookup, registering new terms, and target-term import.
- Apply-to-all/batch mapping, list members, non-string scalars, and edit types
  beyond selected literal-to-term mapping.
- General SSSOM row editing, confidence/comment/reviewer authoring, and mapping
  merge/conflict policy.
- Full committed provenance/history visualization and comparison views.
- A persisted diagnostics artifact; this milestone returns live findings only.
