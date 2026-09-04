# Native-only workspace and codebase refactor

> **Status: approved plan; implementation pending (2026-09-03).** This is the
> active cross-cutting maintenance roadmap. It supersedes the legacy-workspace
> compatibility decisions in
> [`implementation.md`](implementation.md) and
> [`curation-workbench.md`](curation-workbench.md) only as its stages are
> implemented and verified. Update this status and each completed stage in the
> same commits as the corresponding implementation.

## Goal and rationale

Make native ProcessCore `arc.yml` discovery the only OverARC workspace model,
remove compatibility code retained for the original viewer manifest, and then
refactor the backend and frontend around one consistent API and smaller reusable
constructs. Add concise declaration-level documentation for production-owned
components, hooks, types, services, and meaningful helpers touched by the work.

The original read-only viewer predated native ARC provenance, so
`.overarc/viewer.json` enumerated immutable ArcIR files and bound them to exact
digests. The curation milestone later made `arc.yml` authoritative and retained
the viewer manifest solely so existing viewer workspaces and test fixtures could
still load. OverARC has no production compatibility obligation, so maintaining
two discovery paths and a nullable transport shape no longer provides value.

Breaking changes to OverARC's HTTP and TypeScript contracts are allowed. The
core artifact boundary is not relaxed: ArcIR, SSSOM, and ProcessCore remain
authoritative for their formats, F# representations terminate in the dedicated
adapters, and saves continue to publish new artifacts atomically.

## Target API and behavior

- A workspace must contain a valid root-level `arc.yml`. If it is absent or
  invalid, the workspace endpoint returns an RFC 7807 `422` response titled
  `Invalid ARC workspace`; `.overarc/viewer.json` is never inspected.
- `GET /api/v1/workspace` returns `name`, `arcPath`, `defaultStateId`, `states`,
  `findings`, and `curationCapabilities`. Remove `relativeManifestPath`,
  `lineageKind`, and all compatibility defaults from the contract.
- `curationCapabilities.mappingPredicates` is the backend-owned ordered string
  list `skos:exactMatch`, `skos:closeMatch`, `skos:broadMatch`,
  `skos:narrowMatch`, `skos:relatedMatch`. The frontend renders the CURIEs and
  defaults to the first entry; the backend validates mutations against the same
  immutable curation-policy definition.
- Every state summary requires `editable`, `curationErrors`, and `errors`.
  `mappingArtifact` remains nullable because a missing, invalid, or ambiguous
  native SSSOM association is a valid diagnostic outcome.
- State and mapping status values use a shared C# `ArtifactStatus` enum with
  camel-case string serialization and the matching TypeScript union: `valid`,
  `invalid`, `invalidPath`, `missing`, or `digestMismatch`. Deserialization must
  reject undocumented status spellings.
- Remove `lastWriteUtc` from state artifacts and transport. For multiple valid
  current ArcIR tips, `defaultStateId` is the ordinally first exact state ID.
  It is only a deterministic initial UI choice, never lineage or a claim about
  the newest state. It is `null` only when no valid current state exists.
- Preserve `/api/v1`, exact ArcIR identifiers, string-encoded 64-bit and
  canonical floating values, RFC 7807 failures, explicit refresh, and all
  atomic publication and recovery guarantees.

## Implementation stages

### Stage 1 — Remove the legacy workspace path and migrate the contract

- Delete `ViewerManifest`, `ManifestState`, manifest JSON parsing and schema
  validation, `LegacyManifestWorkspaceProvider`, provider selection, and the
  provider interface. Extract one focused native loader behind
  `WorkspaceService`; do not retain an abstraction with only one implementation.
- Delete the old three-argument `WorkspaceService` constructor and the
  browse-only `ArcIrInteropAdapter.Validate(byte[])` path used by manifest
  states. Native ArcIR continues through canonical editing-aware validation.
- Remove manifest-only ID validation, timestamp-based selection, manifest
  comments, and manifest-specific exceptions. Rename remaining viewer-centric
  workspace errors and summaries to native ARC terminology.
- Apply the target workspace DTO and TypeScript contract in one change. Update
  the hand-written client, UI consumers, endpoint metadata, and stable contract
  fixture together; do not provide aliases for removed fields.
- Move supported mapping predicates from `DraftService` and `MappingDialog` to
  one backend-owned capability definition exposed by the workspace response.
  The draft validator and dialog must consume that definition rather than copy
  the values.
- Delete all checked-in `.overarc/viewer.json` files. Convert the API/browser
  viewer fixture and generated performance workspace to native `arc.yml` plus
  canonically digested ArcIR/SSSOM artifacts in the same change, preserving two
  current states where state-switching tests require them.
- Replace manifest-specific tests with native discovery tests and an explicit
  negative test proving a manifest-only workspace receives `422` without its
  manifest being parsed.
- Remove deprecated `document.execCommand('copy')` compatibility behavior.
  A focused clipboard helper uses `navigator.clipboard.writeText`; unavailable
  or rejected writes produce an accessible nonfatal failure message.

### Stage 2 — Establish a bounded native workspace boundary

- Keep `WorkspaceService` responsible for coordinating and publishing the
  current immutable snapshot. Extract native lineage discovery, safe path
  resolution, artifact byte loading/digest verification, and cache ownership
  into focused documented collaborators.
- Use one shared SHA-256 utility for discovery, draft verification, save, and
  tests. Preserve lowercase exact digest comparison.
- Replace the unbounded path-plus-digest caches and retired-snapshot collection
  with a bounded current-snapshot cache. Dispose replaced JSON documents once no
  request owns them, and clone roots explicitly when draft or request lifetimes
  extend beyond a source snapshot.
- Preserve independent invalid-artifact reporting: an invalid current state or
  mapping remains listed without preventing other valid states from loading.
- Keep all path declarations relative to the workspace and reject root escape,
  symbolic links, and reparse-point traversal before reading bytes.

### Stage 3 — Decompose projection, curation, and HTTP composition

- Split graph projection into pure object-node, ArcRelation, derived-reference,
  placeholder, term-usage, and detail-projection helpers. Preserve output order,
  selectors, IDs, multiedges, self-loops, placeholder behavior, and lossless
  numeric transport.
- Split save orchestration into validation, successor naming, canonical artifact
  serialization, atomic publication, and recovery-journal collaborators. Keep
  one orchestration service as the transaction boundary.
- Consolidate SSSOM metadata and row-field lookup so inspection, mapping views,
  reuse checks, and publication use one representation and precedence rule.
- Group `/api/v1` route registration by workspace, state inspection, and
  curation. Add complete success and RFC 7807 response metadata without changing
  route URLs.
- Document all production-owned DTOs, services, adapters, route groups, and
  meaningful private helpers at their declarations.

### Stage 4 — Refactor frontend state and reusable UI behavior

- Keep `useWorkspace` as the façade consumed by `App`, but extract focused hooks
  for workspace catalog/selection, state resources, and draft/save sessions.
  Preserve state-selection precedence, draft reattachment, stale-response
  rejection, cancellation, and refresh behavior explicitly in tests.
- Centralize request lifecycle and error normalization so projection, mappings,
  details, term details, and draft resources share cancellation and stale-result
  rules without introducing global state or React context.
- Replace the graph-specific center-pane name with a semantic center workbench
  component covering Graph, Table, Terms, Mappings, and Changes.
- Extract reusable table sorting/pagination, filter controls, accessible dialog
  behavior, clipboard feedback, and download URL cleanup only at boundaries used
  by multiple features. Avoid one-element wrappers.
- Keep graph/filter/export transformations independent of React and retain
  explicit props and one-way data flow.
- Add JSDoc to the touched production components, hooks, exported types, and
  meaningful helpers, including hook return contracts and status invariants.

### Stage 5 — Consolidate tests and operational documentation

- Confirm `.overarc` is used only as runtime storage for save locks, journals,
  and staging after the Stage 1 fixture migration.
- Remove manifest sentinels from save tests. Continue proving that predecessor
  artifacts, Git state, unrelated files, and dependency sources are untouched.
- Update README, AGENTS.md, API comments, and completed plans when their
  corresponding implementation changes land. Historical milestone descriptions
  may identify removed behavior as history, but no current instruction may
  advertise manifest fallback or timestamp selection.
- Remove duplicated test setup by introducing native workspace builders and
  shared frontend factories local to the appropriate test projects.

## Compatibility audit

The following are compatibility-only and are removed by this plan:

- the legacy viewer-manifest records, loader, provider, fixtures, and tests;
- the legacy `WorkspaceService` constructor;
- browse-only ArcIR validation used solely for manifest workspaces;
- nullable/default workspace DTO members retained for the old response shape;
- the deprecated DOM clipboard fallback; and
- manifest timestamp/default-selection behavior and `lastWriteUtc` transport.

The following remain because they protect current data or deployment behavior,
not old OverARC workspace formats:

- save-journal version validation and crash recovery;
- ArcIR, SSSOM, and ProcessCore format inspection delegated to their libraries;
- invalid UTF-8 and malformed-artifact diagnostics;
- published/development workspace-path resolution and the CLI default workspace;
- SPA hosting fallback and injectable clocks/faults used for deterministic tests;
  and
- presentation fallbacks for genuinely absent labels or malformed graph data.

No alternate HTTP versions, generated-client shims, or other historical
workspace providers were found during the audit.

## Test and acceptance plan

- Replace manifest tests with native coverage for missing/invalid `arc.yml`,
  unsafe paths, symlink/reparse traversal, digest mismatches, mixed valid/invalid
  artifacts, mapping association, refresh, and deterministic multi-tip default
  selection.
- Assert that a workspace containing only `.overarc/viewer.json` is rejected and
  that the file is not parsed.
- Update API and contract tests for every required, renamed, and removed field,
  capability-driven predicates, closed status values, and RFC 7807 errors.
- Preserve draft/save coverage for exact occurrence selection, stale revisions,
  replay/undo, mapping reuse, atomic publication, rollback/recovery, immutable
  predecessors, and branch publication.
- Add focused tests for snapshot disposal/cache bounds, extracted projection
  helpers, workspace hooks, reusable tables/filters/dialogs, clipboard failure,
  and object URL cleanup.
- Preserve Chromium and Firefox flows for loading, state switching, filtering,
  inspection, draft reattachment, save/discard, layout, and PNG/CSV downloads
  against the migrated native fixture.
- Run `npm run lint`, `npm run format:check`, frontend tests, browser tests,
  frontend build, backend tests, and performance checks, followed by the FAKE
  `Build`, `Test`, and `Publish` targets. Run timing-sensitive performance gates
  without competing test processes.
- Audit the resulting source and fixtures for zero production references to
  `ViewerManifest`, `LegacyManifest`, or `.overarc/viewer.json`.

## Delivery order and status

1. **Pending:** native-only discovery, fixture migration, and strict API contract.
2. **Pending:** bounded workspace lifetime and backend reusable services.
3. **Pending:** projection, publication, SSSOM, and route decomposition.
4. **Pending:** `useWorkspace`, center workbench, and shared frontend constructs.
5. **Pending:** complete declaration documentation, plan synchronization, and
   repository-wide verification.

Each stage must leave the repository buildable and must update this status plus
every affected completed plan in the same implementation commit. Do not mark a
stage complete until its focused tests and all directly affected cross-project
gates pass.

## Assumptions

- Breaking OverARC HTTP and TypeScript contract changes require no migration or
  deprecation window.
- Native `arc.yml` is the sole workspace authority; no replacement application
  manifest is introduced.
- This is behavior-preserving except for intentional legacy removal, the strict
  workspace contract, deterministic native initial selection, capability-driven
  predicates, bounded cache lifetime, and modern clipboard behavior.
- Git integration, history traversal, structural authoring, generated clients,
  and global frontend state remain outside this maintenance milestone.
