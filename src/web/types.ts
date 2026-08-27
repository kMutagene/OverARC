export interface Workspace {
  name: string;
  relativeManifestPath: string;
  defaultStateId: string | null;
  states: StateSummary[];
}

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

export interface Term {
  id: string;
  label: string;
  name: string | null;
  source: string | null;
  selector: string;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: string | null;
  typeIds: string[];
  searchText: string;
  isPlaceholder: boolean;
  selector: string | null;
}

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

export interface Projection {
  stateId: string;
  sha256: string;
  terms: Term[];
  nodes: GraphNode[];
  relations: GraphRelation[];
}

export interface ArcValue {
  type: string;
  display: string;
  text?: string;
  boolean?: boolean;
  items?: ArcValue[];
}

export interface AnnotationValue {
  type: string;
  display: string;
  literal?: ArcValue;
  termId?: string;
  unitId?: string;
}

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

export interface PropertyAssertion {
  id: string;
  predicateId: string;
  predicateLabel: string;
  value: ArcValue;
  annotations: Annotation[];
  selector: string;
  valueSelector: string;
}

export interface ElementDetail {
  kind: 'object' | 'relation';
  id: string;
  label: string;
  selector: string;
  objectKind?: string;
  subject?: string;
  predicateId?: string;
  predicateLabel?: string;
  object?: string;
  types: Array<{ id: string; termId: string; termLabel: string; selector: string }>;
  properties: PropertyAssertion[];
  annotations: Annotation[];
}

export interface Filters {
  query: string;
  kinds: Set<string>;
  types: Set<string>;
  predicates: Set<string>;
  context: boolean;
}

export type VisibilityStatus = 'match' | 'context';

export interface VisibleProjection {
  nodeStatus: Map<string, VisibilityStatus>;
  relationStatus: Map<string, VisibilityStatus>;
}
