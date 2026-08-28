# Graph/Table workbench refinement

## Summary

Replace the graph-table overlay with switchable full-center `Graph` and `Table`
views. Preserve graph layout across filtering and view changes, introduce compact
but exact identifier handling, and reduce inspector verbosity through progressive
disclosure.

No HTTP, ArcIR JSON, search, or CSV contract changes are required.

## Step 1 — Decouple graph identity from filtering

Build one complete `MultiDirectedGraph` per active ArcIR state instead of
rebuilding a filtered subgraph.

- Give every node deterministic initial coordinates and every parallel relation a
  lane based on the complete state.
- Apply hidden, match, context, placeholder, selection, and theme styling through
  Sigma reducers using the current `VisibleProjection`.
- Preserve dragged coordinates, camera state, hover state, and layout-running
  state when filters change.
- Make `Focus all` calculate bounds from visible nodes only.
- Keep explicit `Reset layout` and state switching as the only automatic
  coordinate/camera resets.
- Retain inspector selection when an element becomes filtered out and mark it as
  hidden by the current filters.

### Acceptance gate

- Search, kind, type, predicate, and context filters never reload the graph or
  reset the camera.
- Dragged and ForceAtlas-generated positions survive applying and removing
  filters.
- Parallel edges remain in the same lanes as filters change.
- `Focus all` frames only visible nodes.
- State switching still resets camera, coordinates, selection, and layout state.

## Step 2 — Add first-class Graph/Table center views

- Add an accessible `Graph | Table` switch for the center pane.
- Default to Graph on page load and preserve the choice across state changes for
  the current React session only.
- Give each view the complete center-pane dimensions.
- Keep Sigma mounted while Table is active using a same-sized hidden and inert
  view layer rather than `display: none`.
- Resize and refresh Sigma when returning to Graph without resetting its graph or
  camera.
- Switching to Table stops ForceAtlas; returning to Graph does not restart it.
- Share filters, visible counts, selection, and inspector state between views.

### Acceptance gate

- Repeated Graph → Table → Graph switching preserves coordinates, camera, and
  selection.
- Sigma does not return blank, stretched, or incorrectly scaled.
- Switching to Table stops ForceAtlas and updates its controls.
- Inactive view controls are not focusable or exposed as active content.
- Graph remains the default after a reload.

## Step 3 — Build the full-pane table view

- Add `Objects` and `Relations` tabs with visible counts; default to Objects.
- Paginate each tab at 100 rows per page and correct the active page after result
  changes.
- Use the full center pane with sticky view controls, tabs, headers, and
  pagination.
- Keep all cell text ordinarily selectable and use a dedicated `Inspect` action
  column.
- Make every data header sortable. The first click sorts ascending, the second
  descending, and the third restores source order; choosing another column
  starts ascending. Preserve a separate sort per tab, resolve equal values by
  exact ID, and return that tab to page 1 when its sort changes.
- Add copy-exact actions with accessible confirmation.
- Show curator labels plus object/relation status, placeholder information, and
  derived-reference information.

### Acceptance gate

- Cell text can be selected and copied normally.
- Inspect actions resolve to the same exact elements as graph selection.
- Counts and pagination remain correct through filters and state changes.
- Sort direction is visible, exposed through `aria-sort`, stable for equal
  values, and applied before pagination.
- The 10k/25k benchmark never renders every row into the DOM at once.

## Step 4 — Introduce compact identifier presentation

- Add one projection-backed identifier presenter for tables and the inspector.
- Prefer curator labels and term names, with compact namespace/local identifiers
  as secondary text.
- Recognize BioFSharp object, assertion, and relation URNs; abbreviate hash
  identities deterministically and safely decode accession suffixes.
- Fall back to local fragments or deterministic middle ellipsis.
- Keep exact identifiers for graph keys, state, APIs, search, selectors,
  clipboard output, and CSV export.
- Present HTTP(S) IRIs as identifier text with a separate `Open IRI` action. Do
  not probe identifiers over the network.

### Acceptance gate

- Known objects and terms display useful labels rather than full IRIs.
- Long hashes no longer dominate tables or inspector summaries.
- Copy actions return byte-for-byte exact identifiers.
- Encoded, Unicode, unknown, and malformed identifiers render without exceptions.

## Step 5 — Apply progressive disclosure to the inspector

- Keep labels, values, kinds, endpoints, predicates, evidence, and sources visible.
- Move exact IDs, term/property IRIs, selectors, and value selectors into
  collapsed `Technical details` disclosures.
- Keep Types, Properties, and Annotations independently collapsible.
- Show annotation property/value as the primary card content and retain every
  technical field in its disclosure.
- Show a notice when the selected element is hidden by filters.

### Acceptance gate

- Curator-facing information can be scanned without hashes and selectors
  dominating the pane.
- Every ID, IRI, selector, and value selector remains accessible and copyable.
- Technical disclosures are keyboard operable and correctly labelled.
- Hidden selected elements remain inspectable with an accurate notice.

## Step 6 — Record the upstream vocabulary gate

- Add a Phase 5 F1 follow-up to the authoritative BioFSharp.INSDC roadmap stating
  that `http://purl.org/arc/insdc#` and related adapter-local namespaces are
  placeholder identities that must be registered or replaced before production
  F1 output.
- Note that migration changes F1 output, fixtures, canonical digests, and OverARC
  manifests.
- Do not choose a replacement namespace or change F1 output in this UI work.

### Acceptance gate

- The upstream roadmap contains a discoverable production gate.
- OverARC performs no namespace substitution or ontology remapping.
- Existing ArcIR files continue loading under their exact current identities.

## Step 7 — Integration and regression verification

- Cover stable graph identity, reducer visibility, visible bounds, and lanes with
  frontend tests.
- Cover Sigma load/reset/stop/reactivation behavior with component tests.
- Cover table tabs, sorting, pagination, text selection, Inspect actions,
  clipboard output, and empty states.
- Cover compact presentation and exact-value preservation.
- Cover inspector disclosures and hidden-selection notices.
- Add Chromium and Firefox flows for filter stability and repeated view switching.
- Run the full FAKE `Test` target and retain the 10k-object/25k-relation thresholds.

### Final acceptance gate

- Formatting, linting, .NET tests, frontend tests, performance tests, and browser
  tests pass through the FAKE entry point.
- Filtering and view switching never reset graph positions or camera.
- Table mode is fully usable without the graph being visible.
- The inspector remains complete while technical noise is collapsed by default.
- No viewer action modifies ArcIR, manifests, or the sibling repository.
- No API or canonical ArcIR compatibility change is introduced.
