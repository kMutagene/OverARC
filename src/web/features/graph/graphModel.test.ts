import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  nodeViewStyle,
  objectKindColor,
  relationViewStyle,
  visibleCsv,
  visibleGraphBounds,
  visibleProjection,
} from './graphModel';
import type { Filters, Projection } from '../../shared/types';

const projection: Projection = {
  stateId: 'test',
  sha256: 'hash',
  terms: [],
  nodes: [
    {
      id: 'a',
      label: 'Alpha',
      kind: 'Sample',
      typeIds: ['T1'],
      searchText: 'Alpha café value',
      isPlaceholder: false,
      selector: '#/a',
    },
    {
      id: 'b',
      label: 'Beta',
      kind: 'Study',
      typeIds: ['T2'],
      searchText: 'Beta',
      isPlaceholder: false,
      selector: '#/b',
    },
    {
      id: 'c',
      label: 'Gamma',
      kind: 'Sample',
      typeIds: ['T1', 'T2'],
      searchText: 'Gamma',
      isPlaceholder: false,
      selector: '#/c',
    },
  ],
  relations: [
    {
      id: 'ab',
      label: 'contains',
      subject: 'a',
      predicateId: 'P1',
      object: 'b',
      searchText: '',
      isDerived: false,
      selector: '#/ab',
    },
    {
      id: 'bc',
      label: 'related',
      subject: 'b',
      predicateId: 'P2',
      object: 'c',
      searchText: '',
      isDerived: false,
      selector: '#/bc',
    },
    {
      id: 'ac',
      label: 'contains',
      subject: 'a',
      predicateId: 'P1',
      object: 'c',
      searchText: '',
      isDerived: false,
      selector: '#/ac',
    },
  ],
};

const filters = (partial: Partial<Filters> = {}): Filters => ({
  query: '',
  kinds: new Set(),
  types: new Set(),
  predicates: new Set(),
  context: true,
  ...partial,
});

describe('visibleProjection', () => {
  it('normalizes search and provides only one-hop edges from matches', () => {
    const result = visibleProjection(projection, filters({ query: 'CAFÉ' }));
    expect([...result.nodeStatus.entries()]).toEqual([
      ['a', 'match'],
      ['b', 'context'],
      ['c', 'context'],
    ]);
    expect([...result.relationStatus.keys()]).toEqual(['ab', 'ac']);
  });

  it('uses AND across categories and OR within selected values', () => {
    const result = visibleProjection(
      projection,
      filters({ kinds: new Set(['Sample']), types: new Set(['T2']), context: false }),
    );
    expect([...result.nodeStatus.keys()]).toEqual(['c']);
    expect(result.relationStatus.size).toBe(0);
  });

  it('uses predicate filters for traversal', () => {
    const result = visibleProjection(
      projection,
      filters({ query: 'Beta', predicates: new Set(['P1']) }),
    );
    expect([...result.nodeStatus.keys()]).toEqual(['b', 'a']);
    expect([...result.relationStatus.keys()]).toEqual(['ab']);
  });
});

describe('visibleCsv', () => {
  it('escapes CSV and marks match/context rows', () => {
    const withComma = {
      ...projection,
      nodes: [{ ...projection.nodes[0], label: 'Alpha, "quoted"' }, ...projection.nodes.slice(1)],
    };
    const visible = visibleProjection(withComma, filters({ query: 'Alpha' }));
    const csv = visibleCsv(withComma, visible);
    expect(csv.nodes.startsWith('\ufeff')).toBe(true);
    expect(csv.nodes).toContain('"Alpha, ""quoted"""');
    expect(csv.nodes).toContain(',match\r\n');
    expect(csv.relations).toContain(',context\r\n');
  });
});

describe('projection mapping', () => {
  it('creates deterministic directed multigraph coordinates', () => {
    const first = buildGraph(projection);
    const second = buildGraph(projection);
    expect(first.multi).toBe(true);
    expect(first.type).toBe('directed');
    expect(first.size).toBe(3);
    expect(first.getNodeAttributes('a')).toMatchObject(second.getNodeAttributes('a'));
  });

  it('colors nodes by ArcIR object kind while context only dims the kind color', () => {
    const match = nodeViewStyle('observable', false, 'match', 'light');
    const context = nodeViewStyle('collection', false, 'context', 'light');

    expect(match.color).toBe(objectKindColor('observable'));
    expect(context.color).not.toBe(objectKindColor('collection'));
    expect(objectKindColor('observable')).not.toBe(objectKindColor('collection'));
  });

  it('keeps one complete graph while filters only produce view attributes', () => {
    const graph = buildGraph(projection);
    const strict = visibleProjection(projection, filters({ query: 'Alpha', context: false }));

    expect(graph.nodes()).toEqual(['a', 'b', 'c']);
    expect(nodeViewStyle('Sample', false, strict.nodeStatus.get('a'), 'light').hidden).toBe(false);
    expect(nodeViewStyle('Study', false, strict.nodeStatus.get('b'), 'light').hidden).toBe(true);
    expect(relationViewStyle(false, strict.relationStatus.get('ab'), 'light').hidden).toBe(true);
  });

  it('calculates focus bounds from visible node coordinates only', () => {
    const graph = buildGraph(projection);
    graph.mergeNodeAttributes('a', { x: 2, y: 3 });
    graph.mergeNodeAttributes('b', { x: 100, y: 200 });
    const visible = { nodeStatus: new Map([['a', 'match'] as const]), relationStatus: new Map() };
    const bounds = visibleGraphBounds(graph, visible);

    expect(bounds).not.toBeNull();
    expect(bounds!.x[0]).toBeLessThan(2);
    expect(bounds!.x[1]).toBeGreaterThan(2);
    expect(bounds!.x[1]).toBeLessThan(100);
  });

  it('assigns deterministic lanes only to parallel non-self edges', () => {
    const withOverlaps: Projection = {
      ...projection,
      relations: [
        ...projection.relations,
        { ...projection.relations[0], id: 'ab-2', label: 'supports' },
        {
          ...projection.relations[0],
          id: 'ba',
          label: 'opposes',
          subject: 'b',
          object: 'a',
        },
        {
          ...projection.relations[0],
          id: 'aa',
          label: 'self',
          object: 'a',
        },
      ],
    };
    const graph = buildGraph(withOverlaps);
    const reordered = buildGraph({
      ...withOverlaps,
      relations: [...withOverlaps.relations].reverse(),
    });

    expect(
      ['ab', 'ab-2', 'ba'].map((edge) => graph.getEdgeAttribute(edge, 'parallelLane')),
    ).toEqual([-1, 0, 1]);
    expect(['ab', 'ab-2', 'ba'].map((edge) => graph.getEdgeAttribute(edge, 'type'))).toEqual([
      'curved',
      'arrow',
      'curved',
    ]);
    expect(graph.getEdgeAttribute('ab', 'curvature')).toBe(-0.25);
    expect(graph.getEdgeAttribute('ba', 'curvature')).toBe(-0.25);
    expect(graph.getEdgeAttribute('bc', 'type')).toBe('arrow');
    expect(graph.getEdgeAttribute('aa', 'type')).toBe('arrow');
    expect(reordered.getEdgeAttributes('ab')).toEqual(graph.getEdgeAttributes('ab'));
    expect(reordered.getEdgeAttributes('ab-2')).toEqual(graph.getEdgeAttributes('ab-2'));
    expect(reordered.getEdgeAttributes('ba')).toEqual(graph.getEdgeAttributes('ba'));
  });
});
