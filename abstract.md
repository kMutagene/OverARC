# OverARC: Bringing research data artifacts to life through federated curation

**Authors**: Kevin Schneider¹, [Student A]¹, [Student B]¹

**Affiliation**: ¹[Institution — to be filled]

---

## Background

The International Nucleotide Sequence Database Collaboration (INSDC; SRA, ENA, and DDBJ) is an indispensable substrate for meta-analysis, reference-atlas construction, and machine-learning training corpora. Its reuse value, however, is constrained by metadata that are deposited largely as free text and remain effectively immutable after publication. This heterogeneity is well documented across public sequence archives: in plant transcriptomics metadata, even the single concept that a sample is a control can be encoded in dozens of lexical forms, with analogous variation in tissue, treatment, ecotype, developmental-stage, and growth-condition fields.

Submission-side improvements such as checklists, controlled vocabularies, and validation rules improve incoming records but do not repair decades of legacy deposits. As a result, secondary analyses repeatedly perform the same harmonisation work in private, without a durable mechanism for returning curated interpretations to a shared resource. Existing approaches address parts of this problem through centralised automated curation (e.g. MetaSRA, ESPERANTO, EBI BioSamples) or organism-specific manual resources (e.g. ARS for Arabidopsis), but they do not provide a community-extensible, version-controlled overlay that can be re-rendered into stable, citable artifacts.

OverARC addresses this legacy-metadata problem by separating authoritative deposition from community curation. It overlays INSDC records with federated, reviewable contributions hosted on the nfdi4plants DataHub and renders accepted curation into deterministic, DOI-citable consensus artifacts.

## Approach

OverARC consists of a curation substrate, a deterministic rendering workflow, and a reference contributor application. The substrate is a collection of **curation ARCs**: Git-versioned, ISA-compliant FAIR Digital Objects, one per INSDC BioProject. Each curation ARC contains three co-equal curatorial layers. ISA assay sheets describe per-sample experimental parameters such as tissue, treatment, developmental stage, and growth conditions, with units and ontology references where applicable. SSSOM tables embedded as DataMaps encode term-level mappings from free-text annotations to established ontologies such as the Plant Ontology, Plant Environment Ontology, NCBI Taxonomy, and OBI, including curator identity, predicate, confidence, and justification per row. ISA-framework outputs annotated by datamaps represent structured transformations that exceed SSSOM's term-level scope, such as decomposing a free-text title into multiple typed values. These layers may be authored manually or generated automatically; none is treated as a derivative view of another.

The OverARC application is the reference client for creating and extending these ARCs. Given an accession, it resolves the corresponding BioProject, crawls the associated INSDC study, biosample, experiment, and run records, and stores them in a temporary SQLite cache using `BioFSharp.FileFormats.INSDC`. If no curation ARC exists, OverARC creates one via `DataHubClient`, grants the authenticated curator access, and emits an initial baseline commit. This baseline populates 1:1-resolvable ISA fields and records the corresponding automated mappings in SSSOM at approximately 0.8 confidence. Further manual curation then accumulates as commits on the same BioProject-scoped ARC.

Contributions follow standard open-source practice: branches, pull requests, maintainer review, and continuous integration. Validation covers SSSOM schema and required row metadata, predicate validity, ontology-term resolvability against pinned ontology versions, ISA schema validity, and cross-reference integrity against the INSDC index produced through the OverARC crawl path. The substrate is client-agnostic: OverARC is one write path, but command-line tools, notebooks, third-party applications, or direct Git workflows can submit changes to either a curation ARC or its paired consensus ARC. Federation is therefore implemented at the level of contribution and review, while quality control remains uniform at the substrate level.

Each curation ARC is paired with a **consensus ARC** produced by a CWL workflow shipped inside the curation ARC itself. The workflow applies a documented reduction policy for competing mappings, predicate preferences, and alternative preservation, and writes an ISA-structured artifact with row-level provenance to the source commit. Re-rendering is triggered automatically after accepted curation changes; DOI minting remains an explicit human release action. Thus, the consensus ARC provides the stable citation target, while the curation ARC remains the evolving community substrate.

## Demonstration

We demonstrate OverARC on *Arabidopsis thaliana* transcriptomics metadata. Baseline curation ARCs are generated across a broad slice of Arabidopsis BioProjects in the 2026 INSDC re-crawl, establishing an automatically populated layer for fields that can be resolved without semantic interpretation. A subset is then manually curated under a shared standard operating procedure; part of this subset is double-curated to estimate inter-rater agreement.

The released collection is characterised at two levels. Baseline-coverage statistics quantify the number of BioProject-scoped curation ARCs generated, per-field automated mapping coverage, the distribution of automated SSSOM confidence values, and ISA-completeness gains attributable to the initial commit. Hand-curation statistics quantify lexical reduction per metadata field, ontology coverage stratified by SSSOM predicate, inter-curator agreement on the double-curated subset, and the accumulation of commits and contributors over time.

In parallel, we analyse the 2026 INSDC re-crawl as a metadata corpus: refreshed lexical-pattern enumeration for control, treatment, tissue, ecotype, growth condition, and developmental stage; per-field free-text cardinality and long-tail structure; cross-field consistency anomalies; and record-relationship structure across study, biosample, experiment, and run records. Biological re-analyses of the curated corpus are outside the scope of this submission and are being prepared separately.

## Contribution

OverARC contributes a reusable pattern for curating public sequence-archive metadata without modifying the authoritative archive. Its concrete outputs are: (i) the OverARC reference client, supporting libraries, and deterministic CWL rendering workflow; (ii) an Arabidopsis collection of BioProject-scoped curation ARCs and paired consensus ARCs on the nfdi4plants DataHub; and (iii) statistics describing both the legacy metadata problem and the effect of baseline plus manual curation.

The pattern is generalisable beyond Arabidopsis and beyond INSDC. It turns repeated, private harmonisation work into a versioned community process and converts legacy metadata into curated, citable, reproducible research context.
