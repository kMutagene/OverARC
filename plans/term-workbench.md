# ArcIR term workbench

> **Status: active plan (2026-08-28).** The layout and interaction direction is
> approved. Implementation starts after the plan-only commit; every completed
> slice and its verification must be reflected here in the same commit as the
> implementation.

## Summary

Add a first-class, read-only `Terms` center view for the active ArcIR state's
`graph.terms` dictionary. Terms remain shared graph-level definitions rather
than domain nodes. The view provides term-specific discovery, exact inspection,
and complete usage information while establishing selection and command seams
that future curation transactions can use without adding premature editing or
writing canonical ArcIR directly.

The workbench remains a three-pane application:

```text
Workspace and graph filters | Graph / Table / Terms | Inspector
```

No viewer action may modify ArcIR, the workspace manifest, or Git. Future term
edits must enter through authoritative curation transactions that create a new
immutable state and its native provenance/process artifacts atomically.

## Step 1 — Extend the center-view and selection models

- Add `Terms` as a third full-center view alongside `Graph` and `Table`.
- Keep Graph as the reload default and retain the active center view across state
  changes for the current React session only.
- Keep Sigma mounted and same-sized while Terms is active, using the existing
  hidden/inert layer behavior.
- Stop ForceAtlas2 when leaving Graph; returning to Graph must refresh Sigma
  without reloading graph identity, coordinates, or camera state.
- Extend workbench selection to include exact term IRIs without treating terms as
  graph nodes.
- Preserve one shared inspector selection across center-view changes. State
  switching clears selection because terms and graph elements are state-bound.
- Rename graph-specific sidebar search/filter wording where necessary so it does
  not imply that graph filters affect the term dictionary.

### Acceptance gate

- Graph, Table, and Terms are keyboard-operable mutually exclusive center views.
- Terms uses the complete center pane and inactive layers are hidden, inert, and
  absent from the active accessibility path.
- Repeated Graph → Terms → Graph switching preserves Sigma coordinates, camera,
  and graph selection and never restarts ForceAtlas2 automatically.
- Selecting a term never creates a Graphology node or edge.
- Reloading defaults to Graph; state switching preserves the current center view
  but clears the prior state's selection.

## Step 2 — Build the term discovery table

- Add a production-owned term feature rather than placing term behavior in the
  generic graph table component.
- Render all terms from the active projection, independent of graph search,
  context, kind, type, and predicate filters.
- Provide Unicode-normalized search across name, compact/exact IRI, and source.
- Filter by source and usage role. Search and selected filter categories combine
  with AND; selected values within one category combine with OR.
- Show curator-facing name, compact identifier, source, total usage count, and
  usage roles while preserving exact values for state, selection, clipboard, and
  APIs.
- Make data headers use the existing ascending, descending, and source-order sort
  cycle with exact term IRI tie-breaking.
- Paginate at 100 terms per page, correct the active page after result changes,
  and return to page 1 when search, filters, or sort changes.
- Keep cell text ordinarily selectable and use a dedicated `Inspect` action.
- Reuse the existing exact-copy and external-IRI actions.

### Acceptance gate

- The active example state's complete term dictionary is reachable without
  adding terms to the graph.
- Graph filters do not alter term results, and term filters do not alter graph
  visibility or CSV export.
- Search handles Unicode, encoded, malformed, and long identifiers without
  exceptions.
- Sorting is stable, exposed through `aria-sort`, and applied before pagination.
- No more than one 100-row page is rendered into the DOM.
- Copy actions return byte-for-byte exact term IRIs.

## Step 3 — Add complete term usage projection and details

- Compute term usage from the canonical ArcIR JSON projection without copying or
  redefining ArcIR model types.
- Cover these stable transport roles:
  - object type;
  - object property predicate;
  - relation predicate;
  - relation property predicate;
  - annotation property;
  - term value; and
  - unit.
- Count every occurrence, including nested property/annotation structures, while
  keeping roles distinct.
- Add compact usage counts/roles to projection terms for table filtering and
  sorting.
- Load complete occurrences on demand for the selected term instead of embedding
  every occurrence in the graph projection.
- Identify each occurrence by its owning element/assertion/annotation and the
  nearest selector exposed by `BioFSharp.ArcIR`. Do not hand-code the canonical
  ArcIR wire layout in React or introduce a competing JSON-pointer implementation.
- Keep raw F# representations inside `ArcIrInteropAdapter`; HTTP contracts remain
  ordinary C# DTOs and TypeScript types.

### Acceptance gate

- Usage counts exactly equal the on-demand occurrence list for every term.
- Terms used in several roles report every role without double-counting one
  occurrence.
- Unused registered terms remain visible with a zero count.
- Nested annotations, term-valued annotations, units, object/relation properties,
  and relation predicates are covered by backend tests.
- Exact IDs and selectors survive transport without URL-path coercion or
  JavaScript numeric conversion.
- The graph projection remains bounded and does not contain complete occurrence
  lists.

## Step 4 — Add the term inspector

- Dispatch the right pane between object/relation and term inspection while
  retaining one-way selection flow from `App.tsx`.
- Present term name, source, compact identifier, total usage, and roles first.
- Put exact IRI and canonical term selector in a collapsed `Technical details`
  disclosure with exact-copy and external-IRI actions.
- Group complete occurrences by usage role and show their owning element label,
  exact owner/assertion identity, and selector using progressive disclosure.
- Preserve a selected term across Graph/Table/Terms view changes until another
  item is selected, selection is cleared, or the active state changes.
- Keep the inspector useful for unused terms and for terms whose source is absent.

### Acceptance gate

- Every term table Inspect action resolves to the exact selected term.
- The inspector exposes all term fields and every reported usage occurrence.
- Technical disclosures are collapsed by default, keyboard operable, and
  correctly labelled.
- Switching center views does not silently replace or clear the selected term.
- State switching clears term details and never shows occurrences from the prior
  immutable state.

## Step 5 — Establish the future editing seam without editing

- Keep term view models and selection independent from React rendering so future
  commands can target exact term IRIs and occurrence identities.
- Distinguish definition changes (`name`/`source`) from identity replacement
  across usages; an IRI-key replacement is not treated as an ordinary field edit.
- Reserve component boundaries for future transaction-backed actions, impact
  previews, diagnostics, and validation results without rendering disabled or
  misleading edit controls now.
- Document that future commands consume one selected immutable state and produce
  a new complete state plus native provenance/process artifacts atomically.
- Do not add JSON patch generation, direct state-file writes, manifest writes, or
  Git operations.

### Acceptance gate

- No term view action changes workspace bytes or application configuration.
- Exact term and occurrence identities can be passed to a future transaction
  command without parsing presentation labels.
- Definition editing and identity replacement remain explicit, separate future
  operations.
- No placeholder edit button suggests that unsupported persistence is available.

## Step 6 — Integration and regression verification

- Cover term search, source/role filters, three-state sorting, pagination, empty
  states, exact copy, and Inspect actions with fast frontend tests.
- Cover usage role classification, counts, nested occurrences, selector
  preservation, unknown terms, and on-demand details with backend tests.
- Cover term inspector summaries, disclosures, occurrence grouping, state reset,
  and center-view persistence with component tests.
- Add Chromium and Firefox browser flows for Terms navigation, filtering,
  selection, exact inspection, and Graph → Terms → Graph preservation.
- Retain the 10k-object/25k-relation performance thresholds and add a bounded
  synthetic term-table check if term volume materially affects rendering.
- Run the full FAKE `Test` target after formatting, linting, build, backend,
  frontend, performance, and browser checks.

### Final acceptance gate

- The complete term dictionary is discoverable and inspectable in a first-class
  center view.
- Complete usage counts and on-demand occurrences agree exactly.
- Terms never become domain graph nodes and graph filters never hide them.
- Graph state survives repeated Terms view switching.
- The inspector remains exact and complete while technical noise is progressively
  disclosed.
- Formatting, linting, .NET tests, frontend tests, performance tests, and Chromium
  and Firefox flows pass through the repository verification path.
- No API exposes F# representation details and no viewer action mutates ArcIR,
  manifests, the workspace, Git, or the sibling checkout.
