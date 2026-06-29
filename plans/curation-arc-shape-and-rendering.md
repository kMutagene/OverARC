# Curation ARC shape + rendering — iteration plan

## Context

The README's architecture is stable at the principle level (federated contribution to a shared substrate, deterministic rendering into citable consensus artifacts) but vague at two concrete levels: (a) what is actually on disk inside a "curation ARC", and (b) what the CWL "rendering" workflow actually computes. This iteration pins both down so the abstract's claims survive a reader who asks "show me the files."

Two reframings drive the new shape:

1. **Granularity = per-deposit accession.** One curation ARC per INSDC BioProject (`PRJNA*` / `PRJEB*` / `PRJDB*`). Aggregation across projects is an OverARC-app concern (campaigns), not a substrate concern. This changes [README.md:60](../README.md#L60) ("Single curation ARC per scope") and the open question at [README.md:108-109](../README.md#L108-L109).
2. **The curation ARC captures the *process* of curation, not just the result.** ISA's data model is already process-shaped (Source → Process → Output); we use it that way. Each curatorial decision is an ISA assay row whose Source is a free-text annotation and whose Output is the structured/ontology-grounded fact.

## Decisions taken this iteration

- **Process capture**: process-as-ISA-rows. Every curatorial decision is an immutable row with `source`, `process type`, `curator`, `date`, `SOP version`, `confidence`, `justification`, and output columns. Re-curation appends a new row; nothing is overwritten. Auditing requires no `git blame` walk.
- **Rendering site**: two render layers. Each per-BioProject curation ARC renders its own per-project consensus ARC (resolves intra-project / multi-curator conflicts). The OverARC campaign release process aggregates a set of per-project consensus ARCs into a campaign consensus ARC. Both layers can be DOI-minted; the campaign layer is the typical citation target for meta-analyses.
- **Assay structure**: two assay sheets per curation ARC, split by process type. `assays/term-mapping/` is SSSOM-shaped; `assays/property-extraction/` is parameter/value/unit-shaped. Both are direct curatorial output, neither is derived.

## Curation ARC layout (per BioProject)

```
PRJNA000001-curation/
├── isa.investigation.xlsx                # "Curation of INSDC deposit PRJNA000001"
├── studies/
│   └── source-records/
│       ├── isa.study.xlsx                # Sources = INSDC samples (SRR/ERR/DRR)
│       └── resources/
│           └── insdc-snapshot.json       # frozen INSDC metadata at first touch
├── assays/
│   ├── property-extraction/
│   │   ├── isa.assay.xlsx                # process-as-rows; param/value/unit output
│   │   └── dataset/
│   └── term-mapping/
│       ├── isa.assay.xlsx                # process-as-rows; SSSOM-shaped output
│       └── dataset/
│           └── mappings.sssom.tsv        # auto-serialised projection of the assay
├── workflows/
│   └── render-consensus/
│       └── render.cwl                    # references versioned render image
└── runs/
    └── consensus/                        # last per-project render lands here
        └── (a complete consensus ARC tree)
```

### Property-extraction assay — row schema

One row per curatorial decision. Columns (ISA terminology in parens):

- Source Name = sample accession (e.g., `SRR1234567`)
- Source Characteristic[`free_text_annotation`] = the SRA literal that triggered this decision (e.g., `"t35"`)
- Source Characteristic[`field_context`] = which upstream field the literal came from (e.g., `sample_attributes.growth_protocol`)
- Protocol REF = `property-extraction-vN` (links to SOP version in `studies/source-records/resources/`)
- Parameter Value[`curator_id`] = ORCID or DataHub identity
- Parameter Value[`date`] = ISO date
- Parameter Value[`confidence`] = 0.0–1.0
- Parameter Value[`justification`] = free-text rationale
- Sample Name = synthetic (`SRR1234567__growth-temperature`); makes each decision addressable
- Characteristic[`property`] = ontology term + accession (e.g., growth temperature → PATO:0001994)
- Characteristic[`value`] = literal (e.g., `35`)
- Characteristic[`unit`] = ontology term + accession (e.g., °C → UO:0000027)

Multiple rows per `(sample, property)` are allowed and expected (re-curation, second curator, refinement).

### Term-mapping assay — row schema

One row per term-mapping decision. Columns isomorphic to SSSOM rows so the `dataset/mappings.sssom.tsv` is a deterministic projection:

- Source Name = free-text literal (e.g., `"ctrl"`)
- Source Characteristic[`field_context`] = upstream field where the literal occurs
- Protocol REF = `term-mapping-vN`
- Parameter Value[`curator_id`], [`date`], [`confidence`], [`justification`], [`predicate_id`] (skos:exactMatch / closeMatch / broadMatch / narrowMatch)
- Sample Name = synthetic (`ctrl__OBI:0000220`)
- Characteristic[`mapped_term`] = ontology term + accession

The SSSOM TSV is regenerated from the assay on every commit by a CI hook (or symmetric: SSSOM TSV is authoritative and the assay sheet is generated). Either way, one is canonical, the other is mirror. Pick canonical = ISA assay sheet so the file you edit in ARCtrl is the source of truth; SSSOM TSV is build output.

### What lives where, summary

- `studies/source-records/` = inputs to curation (immutable per-project INSDC snapshot, SOPs, references).
- `assays/*/isa.assay.xlsx` = curatorial process records (the heart of the ARC).
- `assays/term-mapping/dataset/mappings.sssom.tsv` = SSSOM projection for tooling compatibility.
- `workflows/render-consensus/` = render CWL (references an external versioned render image; no logic duplicated per-ARC).
- `runs/consensus/` = the most recent per-project consensus render, as a nested ARC tree.

## Rendering — two layers

### Layer 1: per-project consensus (inside the curation ARC)

Trigger: PR merge to `main` of the curation ARC; nightly cron as fallback.
Inputs: the curation ARC at a given commit SHA.
Steps:

1. **Validate** — CI re-runs: ISA schema (ARCtrl), SSSOM schema (sssom-py), predicate validity, ontology resolvability at pinned versions, cross-reference vs INSDCrawler index.
2. **Project to current state per (sample × field)** — apply intra-project reduction policy across multiple curatorial rows:
   - Highest `confidence` wins.
   - Tie-break by most recent `date`, then commit recency.
   - Strict disagreement at high confidence (e.g., two `skos:exactMatch` claims with disjoint outputs) → render fails, surfaced as a curation issue.
3. **Resolve free-text via term-mapping assay** — for any property row whose ontology slot is empty but whose free-text has a term-mapping decision, fill in.
4. **Emit per-project consensus ARC tree** under `runs/consensus/` — clean ISA assay sheets with one row per `(sample × property)`, ontology terms resolved, original free-text preserved in a `*_source` column.
5. **Emit `render-manifest.json`** — curation ARC commit SHA, render-image version, ontology versions, reduction policy SHA, conflict log, unmapped-literal count.
6. **Emit `statistics.json`** — the six curation statistics from [README.md:151-158](../README.md#L151-L158) computed against this project's contribution.

Tagged releases of the curation ARC promote `runs/consensus/` to a DOI-minted release on the DataHub. DOI metadata cites the curation ARC commit.

### Layer 2: campaign aggregation (in OverARC / a separate aggregator)

Trigger: campaign release (manual, in OverARC).
Inputs: a campaign manifest listing N per-project consensus ARC DOIs + a campaign-level reduction/inclusion policy.
Steps:

1. Pull each per-project consensus ARC at its pinned DOI version.
2. Validate that each one's render-manifest is policy-compatible (ontology versions match within tolerance, etc.).
3. Concatenate per-project assay sheets; apply cross-project policy (no reduction needed — projects are disjoint by sample — but campaigns can exclude individual rows by predicate / confidence / field).
4. Emit campaign consensus ARC: investigation file naming the campaign, studies = one per included BioProject, assays = aggregated consensus rows.
5. Emit campaign-level `render-manifest.json` and `statistics.json`.
6. DOI-mint the campaign consensus ARC. This is the citation target downstream meta-analyses use.

The render image (Layer 1) and aggregator (Layer 2) live as versioned, separately-distributed artifacts — not duplicated inside each curation ARC. Each curation ARC's `render.cwl` references an image tag.

## README sections to update

Concrete edits needed (no code, abstract is the artifact):

- [README.md:46](../README.md#L46) one-paragraph summary — replace "single per scope" framing with per-BioProject + campaign-aggregation framing; reword the rendering sentence to say "two render layers, per-project and campaign-aggregated."
- [README.md:50-56](../README.md#L50-L56) entities table — split "Curation ARC" → "Curation ARC (per BioProject)" and "Consensus ARC" → "Per-project consensus ARC" + "Campaign consensus ARC".
- [README.md:60](../README.md#L60) "Single curation ARC per scope" bullet — invert: "One curation ARC per INSDC deposit (`PRJNA*` etc.); campaigns aggregate across ARCs at the OverARC app layer."
- [README.md:61](../README.md#L61) ISA/SSSOM bullet — keep co-equal framing, but add "both captured as ISA process records (process-as-rows); SSSOM TSV is a projection of the term-mapping assay for tooling compatibility."
- [README.md:62](../README.md#L62) campaigns bullet — keep, reinforce by linking to the campaign-aggregation render layer.
- [README.md:70-103](../README.md#L70-L103) mermaid diagram — redraw: per-project curation ARC (multiple, fanned), per-project consensus ARC, then campaign aggregator → campaign consensus ARC → DOI. Add the two render-layer split visibly.
- [README.md:108-109](../README.md#L108-L109) open architectural question — close it: per-BioProject is decided.
- [README.md:126-128](../README.md#L126-L128) "Consensus rendering" subsection — expand to the two-layer description above.
- [README.md:254-262](../README.md#L254-L262) abstract Approach section — restructure to introduce the per-BioProject ARC, the process-as-rows capture, and the two-layer render. This is the biggest prose rewrite.
- [README.md:331](../README.md#L331) reasoning trail "Why single curation ARC" — replace with "Why per-BioProject curation ARC": clean provenance, incremental ingestion, federation lives at the per-project PR + campaign-aggregation seam.

## Verification

There is no code yet; verification is conceptual coherence:

1. **Walk one example by hand.** Take a real Col-0 BioProject with ≥5 samples (e.g., one of the projects already in DEE2). On paper, fill out the property-extraction assay (≥10 rows across ≥3 samples) and the term-mapping assay (≥5 mappings). Confirm the row schema captures everything in [README.md:151-158](../README.md#L151-L158)'s curation statistics without contortion.
2. **Walk the render by hand.** Take the example above with a deliberate intra-project conflict (two curators disagreeing on a `skos:exactMatch` for the same literal). Confirm the reduction policy resolves it deterministically and the manifest captures the conflict log entry.
3. **Walk the campaign render by hand.** Take two per-project consensus ARCs with different ontology version pins (one PO 2025-01, one PO 2025-06). Confirm the aggregator's policy-compatibility check fires and either rejects, warns, or harmonises per the campaign policy.
4. **Word-count the rewritten Approach section.** It will grow — confirm the abstract still fits 750–1,500 words after the Demonstration rewrite that's already pending.

Pass criteria: each walkthrough produces an artifact a reader of the abstract could plausibly imagine without needing more detail than the prose provides.

## Out of scope this iteration

- Concrete reduction-policy YAML schema (deferred to render image v1 implementation; abstract just asserts "explicit, transparent" as it already does).
- Render image distribution mechanism (Docker tag scheme, versioning policy) — implementation detail.
- DOI-minting integration with DataPLANT DataHub specifics — implementation detail.
- The biological re-analysis pipeline (already out of scope per [README.md:38](../README.md#L38)).