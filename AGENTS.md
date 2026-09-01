# AGENTS.md

Operational guide for humans and coding agents working in OverARC. Read this
before making changes that cross a frontend/backend boundary or alter ArcIR
handling.

## Project purpose and current scope

OverARC is the production curation workbench built on the ARC intermediate
representation (ArcIR). Its delivered viewer lists immutable states, projects
objects and relations into a Sigma graph, exposes registered terms and their
usage occurrences, provides complete assertion and annotation details, filters
the visible graph, and exports PNG/CSV views.

The delivered workbench includes the first authoritative edit workflow: mapping
one selected string occurrence to a registered term while publishing immutable
ArcIR and SSSOM successors with native ARC provenance. The delivered conference
demo screenshot milestone adds independently launchable, prebuilt
sample-decomposition workspaces; it does not add structural authoring, history
traversal, Git integration, or an in-app workspace picker. Do not invent a JSON
patch or write
canonical ArcIR directly. Use the core transformations and codecs through the
dedicated adapters, and keep saves within the atomic publication boundary.
`plans/implementation.md` records the completed viewer milestone;
`plans/curation-workbench.md` records the completed first edit workflow; and
`plans/sample-decomposition-conference-demo.md` records the delivered screenshot
milestone and is authoritative for deferred structural authoring.

## Where core domain models come from

ArcIR, SSSOM, and native ARC provenance are not defined in this repository.
Their source repositories remain authoritative, while OverARC consumes their
stable NuGet packages:

| Domain                | NuGet package     | Version |
| --------------------- | ----------------- | ------- |
| ArcIR                 | `BioFSharp.ArcIR` | `0.3.0` |
| SSSOM                 | `PolyglotSSSOM`   | `0.1.0` |
| Native ARC provenance | `ProcessCore`     | `0.1.3` |

Package versions are pinned in `OverARC.Api.csproj` and restored from NuGet.org.
No adjacent dependency source checkout, root environment variable, devcontainer
bind mount, or CI source checkout is required to build OverARC.

Only `ArcIrInteropAdapter.cs`, `SssomInteropAdapter.cs`, and
`ProcessCoreInteropAdapter.cs` may deal with their respective F# representation
details. F# maps, unions, options, results, and records must terminate there and
must not escape into HTTP DTOs or TypeScript contracts. The core libraries own
their canonical codecs, validation, and domain transformations; OverARC owns
application configuration, drafts, transport DTOs, publication, and workbench
behavior.

Do not add a competing production workbench to `BioFSharp.INSDC`, copy ArcIR
types into this repository, or remove the upstream repository's existing viewer.

## Architecture

```text
React/TypeScript workbench
        │ hand-written /api/v1 client
        ▼
C# ASP.NET Core API and transport DTOs
        │
        ├── Workspace services: discovery, safe paths, drafts, publication
        ├── GraphProjectionBuilder: ArcIR JSON projection and details
        └── Dedicated ArcIR, SSSOM, and ProcessCore adapters
                │
                ▼
        versioned core-library NuGet packages
```

The frontend is intentionally ordinary React rather than Fable. The published
application embeds the Vite build into the loopback-bound ASP.NET server.

## Repository layout

```text
.
├── build/                         FAKE build implementation
├── examples/viewer-workspace/     native ARC plus checked-in ArcIR/SSSOM artifacts
├── examples/sample-decomposition/ three self-contained screenshot workspaces
├── plans/implementation.md        authoritative milestone and integration gates
├── plans/curation-workbench.md    completed first edit workflow roadmap
├── plans/sample-decomposition-conference-demo.md demo and structural roadmap
├── src/
│   ├── OverARC.Api/               C# ASP.NET Core API
│   └── web/
│       ├── app/                   root composition and application orchestration
│       ├── features/
│       │   ├── graph/             projection model, Sigma rendering, controls
│       │   ├── inspector/         graph-element and term detail dispatch
│       │   ├── layout/            resizable/collapsible workbench panes
│       │   ├── terms/             term discovery, filtering, and usage inspection
│       │   ├── theme/             persisted light/dark theme
│       │   └── workspace/         states, filters, counts, legend, exports
│       ├── shared/                HTTP client and transport/domain TypeScript types
│       ├── styles/                tokens plus layout/feature styles
│       └── main.tsx               browser entry point
└── tests/
    ├── OverARC.Api.Tests/         C# unit and API integration tests
    ├── browser/                   Playwright tests against the live API and Vite
    ├── contracts/                 stable HTTP response fixtures
    ├── fixtures/                  immutable workspaces owned by automated tests
    ├── performance/               generated large-graph checks
    └── setup/                     shared frontend test initialization
```

Frontend unit and component tests are colocated with the feature they exercise
using `*.test.ts` or `*.test.tsx`. Browser, cross-feature performance, contract,
and shared setup files belong under top-level `tests/`. Vite only bundles modules
reachable from `main.tsx`; colocated test files are never imported by production
code.

## Planning and commits

Before making a commit, update every affected plan so its status accurately
reflects the work and verification included in that commit. Commit the plan
status updates together with the implementation; do not leave completed work
described as pending or unimplemented.

## Build and test commands

Use the FAKE entry point for repository-wide work:

| Task                | Windows             | macOS/Linux          |
| ------------------- | ------------------- | -------------------- |
| Restore             | `build.cmd Restore` | `./build.sh Restore` |
| Format              | `build.cmd Format`  | `./build.sh Format`  |
| Build               | `build.cmd Build`   | `./build.sh Build`   |
| Test all            | `build.cmd Test`    | `./build.sh Test`    |
| Development servers | `build.cmd Dev`     | `./build.sh Dev`     |
| Publish one server  | `build.cmd Publish` | `./build.sh Publish` |

During focused frontend iteration, `npm run lint`, `npm run format:check`,
`npm test`, `npm run test:browser`, and `npm run build` are appropriate. Run the
FAKE targets before handing off changes that cross projects or affect publishing.

`Dev` serves ASP.NET on `127.0.0.1:5080` and Vite on `127.0.0.1:5173` with a
same-origin development proxy. Playwright uses isolated ports `5081`/`5174` and
the immutable workspace under `tests/fixtures`; it must not reuse an active
development server. Build output under `dist/` and
`src/OverARC.Api/wwwroot/` is generated; do not hand-edit it.

Pass `--workspace <path>` after the `Dev` target to select a development
workspace. Relative paths resolve against the repository root, absolute paths
are accepted, and the default remains `examples/viewer-workspace`. The option is
forwarded only to the API; `npm run dev` remains Vite-only, and API/Vite output
remains unprefixed and interleaved in the shared console.

## Frontend conventions

- Organize by user-facing feature, not by generic `components`/`hooks` buckets.
- Keep `App.tsx` as composition and shared-state ownership. Put concrete browser
  synchronization in focused hooks such as `useTheme`, `usePaneLayout`, and
  `useWorkspace`.
- Prefer explicit props and one-way data flow. Do not add global state libraries
  or React context until multiple distant consumers make them necessary.
- Extract components at semantic UI boundaries. Avoid both monolithic render
  trees and one-off wrappers that merely rename a single element.
- Document production-owned components, hooks, exported types, services, and
  meaningful private helpers at their declaration. Prefer concise JSDoc/XML
  summaries that explain usage and invariants; do not narrate obvious JSX,
  assignments, or test callbacks line by line.
- Do not implement new functionality without documenting its production-owned
  components, hooks, types, services, and meaningful helpers in the same change.
  When existing functionality or an invariant changes, update every affected
  declaration comment and related operational documentation as part of that
  change; stale documentation is a failed implementation gate.
- Keep pure graph/filter/export transformations independent of React and cover
  them with fast unit tests.
- Preserve exact ArcIR IDs in state and API calls. Labels are presentation only.
- Theme both DOM surfaces and Sigma canvas colors. Theme changes must not rebuild
  the graph or reset camera/layout state.
- Keep accessibility paths working: pane separators are keyboard operable,
  inspector sections are disclosures, and the visible graph has a table
  alternative.
- Use the hand-written API client. Do not introduce generated clients without an
  explicit architecture decision.

## Graph and transport invariants

- Use Graphology `MultiDirectedGraph`; ArcRelations are directed multiedges keyed
  by exact relation IRI.
- Objects are nodes. Terms label assertions and predicates but are not ordinary
  domain nodes.
- `ArcValue.Ref` may produce a view-only derived reference edge; it is never an
  ArcRelation and must be identified as such in the inspector/export.
- Missing endpoints become projection-only placeholder nodes so malformed graphs
  remain inspectable.
- Parallel non-self edges use deterministic lanes ordered by exact relation ID.
  Self-loop rendering is a separate concern.
- JavaScript transport represents 64-bit integers and canonical floating values
  as strings. Never coerce them through `number`.
- Search/filtering is client-side and Unicode-normalized. Filter categories use
  AND; selected values within one category use OR.

## Workspace and backend safety

Native discovery uses `arc.yml` and explicit ProcessCore artifact succession;
it never uses timestamps or viewer-manifest order to infer current artifacts.
Workspaces without `arc.yml` use the legacy viewer manifest and remain read-only.
The viewer manifest is application configuration, not provenance. All declared
artifact paths are relative to the workspace, must remain below it, and may not
traverse symbolic links/reparse points. Digests bind entries to immutable bytes.
Invalid entries remain listed independently and must not prevent valid-state
browsing.

Browsing, filtering, inspection, and draft mutation may not modify workspace
artifacts. Only an explicit curation save may publish create-new ArcIR/SSSOM
artifacts and atomically replace native `arc.yml`; it never writes the viewer
manifest, predecessor artifacts, Git, or dependency source repositories. Tests
generate the 10k/25k benchmark at runtime rather than committing it. Preserve
RFC 7807 errors and the documented `/api/v1` contract when changing backend
behavior.

## Files and changes to avoid

- Do not edit generated build/publish output.
- Do not redefine or fork the ArcIR JSON schema in OverARC.
- Do not expose raw F# representations through C# contracts.
- Do not bypass the selected-literal core transformation or atomic save gate.
- Do not treat filesystem modification time or the initially selected state as
  provenance, lineage, or “latest curated state.”
- Preserve unrelated working-tree changes; example workspaces are often edited
  during UI development.
