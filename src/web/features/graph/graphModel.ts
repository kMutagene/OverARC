import { MultiDirectedGraph } from 'graphology';
import type {
  Filters,
  GraphNode,
  GraphRelation,
  Projection,
  Theme,
  VisibilityStatus,
  VisibleProjection,
} from '../../shared/types';

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();

export const ARC_OBJECT_KIND_COLORS: Readonly<Record<string, string>> = {
  observable: '#2563eb',
  instrument: '#0891b2',
  resource: '#d97706',
  activity: '#7c3aed',
  agent: '#db2777',
  role: '#b45309',
  recipe: '#16a34a',
  collection: '#4f46e5',
  selector: '#0d9488',
};

const unresolvedColor = '#64748b';
const parallelLaneCurvature = 0.25;
const darkGraphBackground = '#111817';

export function objectKindColor(kind: string | null): string {
  return (kind && ARC_OBJECT_KIND_COLORS[kind.toLocaleLowerCase()]) || unresolvedColor;
}

function mixWith(color: string, target: readonly number[], amount: number): string {
  const channel = (offset: number) => Number.parseInt(color.slice(offset, offset + 2), 16);
  const mixed = [channel(1), channel(3), channel(5)].map((value, index) =>
    Math.round(value + (target[index] - value) * amount),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function mixWithHex(color: string, target: string, amount: number): string {
  const channel = (offset: number) => Number.parseInt(target.slice(offset, offset + 2), 16);
  return mixWith(color, [channel(1), channel(3), channel(5)], amount);
}

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

export function nodeViewStyle(
  kind: string | null,
  isPlaceholder: boolean,
  status: VisibilityStatus | undefined,
  theme: Theme,
) {
  const kindColor = objectKindColor(kind);
  const darkKindColor = mixWith(kindColor, [0xff, 0xff, 0xff], 0.18);
  return {
    hidden: status === undefined,
    size: isPlaceholder ? 7 : status === 'match' ? 9 : 5,
    color:
      theme === 'dark'
        ? status === 'context'
          ? mixWithHex(darkKindColor, darkGraphBackground, 0.58)
          : darkKindColor
        : status === 'context'
          ? mixWith(kindColor, [0xf4, 0xf5, 0xf6], 0.58)
          : kindColor,
  };
}

export function relationViewStyle(
  isDerived: boolean,
  status: VisibilityStatus | undefined,
  theme: Theme,
) {
  const context = status === 'context';
  return {
    hidden: status === undefined,
    size: status === 'match' ? 2 : 1,
    color:
      theme === 'dark'
        ? context
          ? isDerived
            ? '#514868'
            : '#40514f'
          : isDerived
            ? '#a78bfa'
            : '#91aaa5'
        : context
          ? isDerived
            ? '#d8c9ef'
            : '#cbd5d1'
          : isDerived
            ? '#8b5cf6'
            : '#526a66',
  };
}

export function buildGraph(projection: Projection): MultiDirectedGraph {
  const graph = new MultiDirectedGraph();
  for (const node of projection.nodes) {
    const kindColor = objectKindColor(node.kind);
    const darkKindColor = mixWith(kindColor, [0xff, 0xff, 0xff], 0.18);
    graph.addNode(node.id, {
      ...hashPosition(node.id),
      label: node.label,
      size: node.isPlaceholder ? 7 : 9,
      color: kindColor,
      darkColor: darkKindColor,
      kind: node.kind,
      isPlaceholder: node.isPlaceholder,
    });
  }
  for (const relation of [...projection.relations].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  )) {
    if (!graph.hasNode(relation.subject) || !graph.hasNode(relation.object)) continue;
    graph.addDirectedEdgeWithKey(relation.id, relation.subject, relation.object, {
      label: relation.label,
      size: 2,
      color: relation.isDerived ? '#8b5cf6' : '#526a66',
      darkColor: relation.isDerived ? '#a78bfa' : '#91aaa5',
      isDerived: relation.isDerived,
      type: 'arrow',
    });
  }

  const parallelGroups = new Map<string, string[]>();
  graph.forEachEdge((edge, _attributes, source, target) => {
    if (source === target) return;
    const endpoints = source < target ? [source, target] : [target, source];
    const key = JSON.stringify(endpoints);
    const edges = parallelGroups.get(key) ?? [];
    edges.push(edge);
    parallelGroups.set(key, edges);
  });

  for (const edges of parallelGroups.values()) {
    if (edges.length < 2) continue;
    edges.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    const middle = (edges.length - 1) / 2;
    edges.forEach((edge, index) => {
      const lane = index - middle;
      const source = graph.source(edge);
      const target = graph.target(edge);
      graph.mergeEdgeAttributes(edge, {
        parallelLane: lane,
        type: lane === 0 ? 'arrow' : 'curved',
        ...(lane === 0
          ? {}
          : {
              curvature: lane * parallelLaneCurvature * (source < target ? 1 : -1),
            }),
      });
    });
  }

  return graph;
}

export interface GraphBounds {
  x: [number, number];
  y: [number, number];
}

export function visibleGraphBounds(
  graph: MultiDirectedGraph,
  visible: VisibleProjection,
): GraphBounds | null {
  const positions = [...visible.nodeStatus.keys()]
    .filter((node) => graph.hasNode(node))
    .map((node) => graph.getNodeAttributes(node))
    .filter(
      (attributes) => Number.isFinite(attributes.x) && Number.isFinite(attributes.y),
    ) as Array<{ x: number; y: number }>;
  if (positions.length === 0) return null;

  const xs = positions.map(({ x }) => x);
  const ys = positions.map(({ y }) => y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const padding = span * 0.08;
  if (minX === maxX) {
    minX -= span / 2;
    maxX += span / 2;
  }
  if (minY === maxY) {
    minY -= span / 2;
    maxY += span / 2;
  }
  return { x: [minX - padding, maxX + padding], y: [minY - padding, maxY + padding] };
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
