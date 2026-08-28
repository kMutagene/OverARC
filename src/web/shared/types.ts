/** Application configuration and independently validated state entries returned by the workspace API. */
export interface Workspace {
  name: string;
  relativeManifestPath: string;
  defaultStateId: string | null;
  states: StateSummary[];
  lineageKind?: 'nativeArc';
  findings?: string[];
}

/** Metadata, validation, and optional native editability for one immutable ArcIR state. */
export interface StateSummary {
  id: string;
  label: string;
  relativePath: string;
  sha256: string;
  status: string;
  lastWriteUtc: string | null;
  formatVersion: string | null;
  objectCount: number | null;
  relationCount: number | null;
  errors: string[];
  editable?: boolean;
  mappingArtifact?: MappingArtifactSummary;
  curationErrors?: string[];
}

/** Validation and identity metadata for the native SSSOM base paired to a state. */
export interface MappingArtifactSummary {
  relativePath: string;
  sha256?: string;
  status: string;
  sssomVersion?: string;
  mappingSetId?: string;
  mappingCount?: number;
  errors: string[];
}

/** One populated standard or declared extension SSSOM slot with lossless lexical values. */
export interface SssomField {
  name: string;
  values: string[];
}

/** One zero-based SSSOM mapping row projected without coercing numeric or identifier fields. */
export interface SssomMapping {
  index: number;
  fields: SssomField[];
}

/** Validated SSSOM metadata and records for an immutable state or replayed draft. */
export interface Mappings {
  stateId: string;
  draftId: string | null;
  relativePath: string | null;
  sha256: string;
  isDraft: boolean;
  sssomVersion: string | null;
  mappingSetId: string;
  license: string;
  metadataFields: SssomField[];
  mappings: SssomMapping[];
}

/** Exact SSSOM identity fields used by one replayed draft command and native provenance lane. */
export interface SssomMappingRecord {
  index: number;
  recordId: string | null;
  subjectLabel: string | null;
  predicateId: string;
  objectId: string | null;
  objectLabel: string | null;
  mappingJustification: string;
}

/** One ordered typed selected-literal operation in a server-owned draft. */
export interface CurationOperation {
  id: string;
  selector: string;
  literal: string;
  targetTermId: string;
  targetTermLabel: string;
  predicateId: string;
  proposedRecordId: string;
  outputSelector: string;
  arcIrStatus: string;
  mappingCreated: boolean;
  mappingRecord: SssomMappingRecord;
}

/** Reattachable in-memory draft whose 64-bit optimistic revision remains decimal text. */
export interface CurationDraft {
  id: string;
  stateId: string;
  revision: string;
  processName: string;
  curator: string;
  createdUtc: string;
  lastAccessUtc: string;
  baseArcIrSha256: string;
  baseSssomSha256: string;
  arcIrSha256: string;
  sssomSha256: string;
  operations: CurationOperation[];
}

/** Immutable artifact identities and selected successor returned after an atomic local save. */
export interface CurationSave {
  draftId: string;
  processName: string;
  saveUtc: string;
  successorStateId: string;
  arcIrPath: string;
  arcIrSha256: string;
  mappingPath: string;
  mappingSha256: string;
  mappingCreated: boolean;
  arcYamlSha256: string;
}

/** One supported exact string occurrence offered to the typed mapping dialog. */
export interface LiteralOccurrence {
  selector: string;
  literal: string;
  context: string;
}

/** Compact term metadata used for graph labels, filter choices, links, and selectors. */
export interface Term {
  id: string;
  label: string;
  name: string | null;
  source: string | null;
  selector: string;
  usageCount: number;
  usageRoles: TermUsageRole[];
}

/** Stable semantic roles through which an ArcIR term can be referenced. */
export type TermUsageRole =
  | 'objectType'
  | 'objectPropertyPredicate'
  | 'relationPredicate'
  | 'relationPropertyPredicate'
  | 'annotationProperty'
  | 'termValue'
  | 'unit';

/** One exact term occurrence and its nearest core-generated ArcIR selector. */
export interface TermUsage {
  role: TermUsageRole;
  ownerKind: 'object' | 'relation';
  ownerId: string;
  ownerLabel: string;
  occurrenceId: string;
  selector: string;
}

/** Complete on-demand definition and usage details for one registered ArcIR term. */
export interface TermDetail extends Term {
  usages: TermUsage[];
}

/** An ArcIR object or projection-only missing-endpoint placeholder in the graph response. */
export interface GraphNode {
  id: string;
  label: string;
  kind: string | null;
  typeIds: string[];
  searchText: string;
  isPlaceholder: boolean;
  selector: string | null;
}

/** An ArcRelation or view-only ArcValue.Ref edge in the graph response. */
export interface GraphRelation {
  id: string;
  label: string;
  subject: string;
  predicateId: string;
  object: string;
  searchText: string;
  isDerived: boolean;
  selector: string | null;
}

/** Complete client-side graph projection for one immutable state. */
export interface Projection {
  stateId: string;
  sha256: string;
  terms: Term[];
  nodes: GraphNode[];
  relations: GraphRelation[];
}

/** JavaScript-safe representation of any ArcValue, including recursive lists and exact numeric text. */
export interface ArcValue {
  type: string;
  display: string;
  text?: string;
  boolean?: boolean;
  items?: ArcValue[];
}

/** Inspector representation of literal, term, and optional unit-bearing annotation values. */
export interface AnnotationValue {
  type: string;
  display: string;
  literal?: ArcValue;
  termId?: string;
  unitId?: string;
}

/** Complete annotation metadata, provenance references, and canonical JSON selectors. */
export interface Annotation {
  id: string;
  propertyId: string;
  propertyLabel: string;
  value: AnnotationValue;
  evidence?: string;
  source?: string;
  selector: string;
  valueSelector: string;
}

/** Object or relation property assertion with its nested annotations and exact selectors. */
export interface PropertyAssertion {
  id: string;
  predicateId: string;
  predicateLabel: string;
  value: ArcValue;
  annotations: Annotation[];
  selector: string;
  valueSelector: string;
}

/** Inspector payload for an ArcIR element or a locally projected placeholder/reference edge. */
export interface ElementDetail {
  kind: 'object' | 'relation';
  id: string;
  label: string;
  selector: string;
  isPlaceholder?: boolean;
  isDerivedReference?: boolean;
  placeholderReferences?: Array<{
    relationId: string;
    relationLabel: string;
    endpoint: 'subject' | 'object' | 'subject and object';
    otherId: string;
  }>;
  objectKind?: string;
  subject?: string;
  predicateId?: string;
  predicateLabel?: string;
  object?: string;
  types: Array<{ id: string; termId: string; termLabel: string; selector: string }>;
  properties: PropertyAssertion[];
  annotations: Annotation[];
}

/** User-controlled semantic filters; categories combine with AND and members within a set with OR. */
export interface Filters {
  query: string;
  kinds: Set<string>;
  types: Set<string>;
  predicates: Set<string>;
  context: boolean;
}

/** Why an element is currently visible: a strict filter match or one-hop context. */
export type VisibilityStatus = 'match' | 'context';

/** Exact IDs and visibility roles for nodes and relations rendered by either center view. */
export interface VisibleProjection {
  nodeStatus: Map<string, VisibilityStatus>;
  relationStatus: Map<string, VisibilityStatus>;
}

/** Exact state-bound identity shared by center views and the inspector. */
export type Selection = { kind: 'object' | 'relation' | 'term'; id: string };

/** Supported DOM and Sigma color schemes. */
export type Theme = 'light' | 'dark';
