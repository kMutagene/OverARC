/** Application configuration and independently validated state entries returned by the workspace API. */
export interface Workspace {
  name: string;
  relativeManifestPath: string;
  defaultStateId: string | null;
  states: StateSummary[];
}

/** Manifest metadata and current validation result for one immutable ArcIR state. */
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
