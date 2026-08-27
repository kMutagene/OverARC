import { MultiDirectedGraph } from 'graphology';
import type {
  Filters,
  GraphNode,
  GraphRelation,
  Projection,
  VisibilityStatus,
  VisibleProjection,
} from './types';

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();

export function visibleProjection(projection: Projection, filters: Filters): VisibleProjection {
  const query = normalize(filters.query.trim());
  const strictMatches = new Set(
    projection.nodes
      .filter((node) => {
        const queryMatches = !query || normalize(node.searchText).includes(query);
        const kindMatches =
          filters.kinds.size === 0 || (node.kind !== null && filters.kinds.has(node.kind));
        const typeMatches =
          filters.types.size === 0 || node.typeIds.some((id) => filters.types.has(id));
        return queryMatches && kindMatches && typeMatches;
      })
      .map((node) => node.id),
  );

  const traversable = projection.relations.filter(
    (relation) => filters.predicates.size === 0 || filters.predicates.has(relation.predicateId),
  );
  const nodeStatus = new Map<string, VisibilityStatus>();
  strictMatches.forEach((id) => nodeStatus.set(id, 'match'));

  if (filters.context) {
    for (const relation of traversable) {
      if (strictMatches.has(relation.subject) || strictMatches.has(relation.object)) {
        if (!strictMatches.has(relation.subject)) nodeStatus.set(relation.subject, 'context');
        if (!strictMatches.has(relation.object)) nodeStatus.set(relation.object, 'context');
      }
    }
  }

  const relationStatus = new Map<string, VisibilityStatus>();
  for (const relation of traversable) {
    const subjectMatch = strictMatches.has(relation.subject);
    const objectMatch = strictMatches.has(relation.object);
    if (subjectMatch && objectMatch) relationStatus.set(relation.id, 'match');
    else if (filters.context && (subjectMatch || objectMatch))
      relationStatus.set(relation.id, 'context');
  }

  return { nodeStatus, relationStatus };
}

function hashPosition(id: string): { x: number; y: number } {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (const char of id) {
    a = Math.imul(a ^ char.codePointAt(0)!, 0x01000193);
    b = Math.imul(b ^ (char.codePointAt(0)! + 17), 0x85ebca6b);
  }
  const angle = ((a >>> 0) / 0xffffffff) * Math.PI * 2;
  const radius = 1 + ((b >>> 0) / 0xffffffff) * 9;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function buildGraph(projection: Projection, visible: VisibleProjection): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  for (const node of projection.nodes) {
    const status = visible.nodeStatus.get(node.id);
    if (!status) continue;
    graph.addNode(node.id, {
      ...hashPosition(node.id),
      label: node.label,
      size: node.isPlaceholder ? 7 : status === 'match' ? 9 : 5,
      color: node.isPlaceholder ? '#d97706' : status === 'match' ? '#087f73' : '#a9bbb8',
      status,
      kind: node.kind,
      isPlaceholder: node.isPlaceholder,
    });
  }
  for (const relation of projection.relations) {
    const status = visible.relationStatus.get(relation.id);
    if (!status || !graph.hasNode(relation.subject) || !graph.hasNode(relation.object)) continue;
    graph.addDirectedEdgeWithKey(relation.id, relation.subject, relation.object, {
      label: relation.label,
      size: status === 'match' ? 2 : 1,
      color: relation.isDerived ? '#8b5cf6' : status === 'match' ? '#416b67' : '#c7d1cf',
      type: 'arrow',
      status,
    });
  }
  return graph;
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function visibleCsv(projection: Projection, visible: VisibleProjection) {
  const nodeHeader = ['id', 'label', 'kind', 'typeIds', 'placeholder', 'status'];
  const nodes = projection.nodes
    .filter((node) => visible.nodeStatus.has(node.id))
    .map((node) => [
      node.id,
      node.label,
      node.kind,
      node.typeIds.join('|'),
      node.isPlaceholder,
      visible.nodeStatus.get(node.id),
    ]);
  const relationHeader = ['id', 'label', 'subject', 'predicate', 'object', 'derived', 'status'];
  const relations = projection.relations
    .filter((relation) => visible.relationStatus.has(relation.id))
    .map((relation) => [
      relation.id,
      relation.label,
      relation.subject,
      relation.predicateId,
      relation.object,
      relation.isDerived,
      visible.relationStatus.get(relation.id),
    ]);
  const render = (header: unknown[], rows: unknown[][]) =>
    '\ufeff' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return { nodes: render(nodeHeader, nodes), relations: render(relationHeader, relations) };
}

export function filterOptions(projection: Projection) {
  const kinds = [
    ...new Set(projection.nodes.flatMap((node) => (node.kind ? [node.kind] : []))),
  ].sort();
  const types = [...new Set(projection.nodes.flatMap((node) => node.typeIds))].sort();
  const predicates = [
    ...new Set(projection.relations.map((relation) => relation.predicateId)),
  ].sort();
  return { kinds, types, predicates };
}

export function nodeById(projection: Projection, id: string): GraphNode | undefined {
  return projection.nodes.find((node) => node.id === id);
}

export function relationById(projection: Projection, id: string): GraphRelation | undefined {
  return projection.relations.find((relation) => relation.id === id);
}
