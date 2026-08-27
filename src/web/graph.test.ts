import { describe, expect, it } from 'vitest';
import { buildGraph, visibleCsv, visibleProjection } from './graph';
import type { Filters, Projection } from './types';

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
    const visible = visibleProjection(projection, filters());
    const first = buildGraph(projection, visible);
    const second = buildGraph(projection, visible);
    expect(first.multi).toBe(true);
    expect(first.type).toBe('directed');
    expect(first.size).toBe(3);
    expect(first.getNodeAttributes('a')).toMatchObject(second.getNodeAttributes('a'));
  });
});
