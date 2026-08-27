# AGENTS.md

Operational guide for humans and coding agents working in OverARC. Read this
before making changes that cross a frontend/backend boundary or alter ArcIR
handling.

## Project purpose and current scope

OverARC is the production curation workbench built on the ARC intermediate
representation (ArcIR). The current milestone is a curator-oriented, read-only
graph viewer for immutable ArcIR 1.0 states. It lists locally configured states,
projects objects and relations into a Sigma graph, exposes complete assertion and
annotation details, filters the visible graph, and exports PNG/CSV views.

Editing, Git writes, provenance/history views, diagnostics, SSSOM, DataHub access,
and external-workspace setup are future phases. Do not invent a JSON patch or
write canonical ArcIR directly. Authoritative editing starts only when the core
libraries expose curation transactions that produce a new state and its
provenance/process artifacts atomically. See `plans/implementation.md` for the
authoritative roadmap.

## Where ArcIR comes from

ArcIR is not defined in this repository. Its source of truth is the sibling
`BioFSharp.INSDC` checkout, specifically:

```text
BioFSharp.INSDC/src/BioFSharp.ArcIR/BioFSharp.ArcIR.fsproj
```

The ASP.NET project references that F# project directly. MSBuild resolves the
checkout from `BIOFSHARP_INSDC_ROOT`; `Directory.Build.props` supplies the known
local sibling-layout fallback. The devcontainer mounts the sibling checkout at
`/workspaces/BioFSharp.INSDC`. CI is expected to use the pinned BioFSharp commit
recorded in the implementation plan.

Only `src/OverARC.Api/ArcIrInteropAdapter.cs` may deal with F# representation
details. F# maps, unions, options, and results must terminate there and must not
escape into HTTP DTOs or TypeScript contracts. `BioFSharp.ArcIR` owns the
canonical codec, validation, IRI model, and typed JSON selectors; OverARC owns
application configuration, projection DTOs, and workbench behavior.

Do not add a competing production workbench to `BioFSharp.INSDC`, copy ArcIR
types into this repository, or remove the sibling repository's existing viewer.

## Architecture

```text
React/TypeScript workbench
        │ hand-written /api/v1 client
        ▼
C# ASP.NET Core API and transport DTOs
        │
        ├── WorkspaceService: manifest, safe paths, digests, cache
        ├── GraphProjectionBuilder: ArcIR JSON projection and details
        └── ArcIrInteropAdapter: the only C#/F# boundary
                │
                ▼
        sibling BioFSharp.ArcIR project
```

The frontend is intentionally ordinary React rather than Fable. The published
application embeds the Vite build into the loopback-bound ASP.NET server.

## Repository layout

```text
.
├── build/                         FAKE build implementation
├── examples/viewer-workspace/     checked-in viewer configuration and ArcIR states
├── plans/implementation.md        authoritative milestone and integration gates
├── src/
│   ├── OverARC.Api/               C# ASP.NET Core API
│   └── web/
│       ├── app/                   root composition and application orchestration
│       ├── features/
│       │   ├── graph/             projection model, Sigma rendering, controls
│       │   ├── inspector/         object/relation detail presentation
│       │   ├── layout/            resizable/collapsible workbench panes
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

## Frontend conventions

- Organize by user-facing feature, not by generic `components`/`hooks` buckets.
- Keep `App.tsx` as composition and shared-state ownership. Put concrete browser
  synchronization in focused hooks such as `useTheme`, `usePaneLayout`, and
  `useWorkspace`.
- Prefer explicit props and one-way data flow. Do not add global state libraries
  or React context until multiple distant consumers make them necessary.
- Extract components at semantic UI boundaries. Avoid both monolithic render
  trees and one-off wrappers that merely rename a single element.
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

The viewer manifest is application configuration, not provenance. State paths are
relative to the workspace, must remain below it, and may not traverse symbolic
links/reparse points. Digests bind entries to immutable bytes. Invalid entries
remain listed independently and must not prevent valid-state browsing.

No viewer action may modify the workspace, its manifest, ArcIR state files, or the
sibling BioFSharp checkout. Tests generate the 10k/25k benchmark at runtime rather
than committing it. Preserve RFC 7807 errors and the documented `/api/v1`
contract when changing backend behavior.

## Files and changes to avoid

- Do not edit generated build/publish output.
- Do not redefine or fork the ArcIR JSON schema in OverARC.
- Do not expose raw F# representations through C# contracts.
- Do not add editing before the core curation-transaction gate.
- Do not treat filesystem modification time or the initially selected state as
  provenance, lineage, or “latest curated state.”
- Preserve unrelated working-tree changes; example workspaces are often edited
  during UI development.
