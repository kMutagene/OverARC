import { describe, expect, it } from 'vitest';
import { buildGraph, visibleProjection } from '../../src/web/features/graph/graphModel';
import type { Filters, Projection } from '../../src/web/shared/types';

function benchmarkProjection(): Projection {
  const nodes = Array.from({ length: 10_000 }, (_, index) => ({
    id: `urn:benchmark:object:${index}`,
    label: `Object ${index}`,
    kind: index % 2 === 0 ? 'sample' : 'study',
    typeIds: [`urn:benchmark:type:${index % 8}`],
    searchText: `Object ${index} benchmark value group ${index % 100}`,
    isPlaceholder: false,
    selector: `#/graph/objects/${index}`,
  }));
  const relations = Array.from({ length: 25_000 }, (_, index) => ({
    id: `urn:benchmark:relation:${index}`,
    label: 'contains',
    subject: nodes[index % nodes.length].id,
    predicateId: `urn:benchmark:predicate:${index % 4}`,
    object: nodes[(index * 17 + 1) % nodes.length].id,
    searchText: `relation ${index} contains`,
    isDerived: false,
    selector: `#/graph/relations/${index}`,
  }));
  return { stateId: 'benchmark', sha256: 'generated', terms: [], nodes, relations };
}

const filters = (query = ''): Filters => ({
  query,
  kinds: new Set(),
  types: new Set(),
  predicates: new Set(),
  context: true,
});

describe('generated 10k object / 25k relation benchmark', () => {
  it('builds the interactive graph in under five seconds', () => {
    const projection = benchmarkProjection();
    const started = performance.now();
    const visible = visibleProjection(projection, filters());
    const graph = buildGraph(projection, visible);
    const elapsed = performance.now() - started;
    expect(graph.order).toBe(10_000);
    expect(graph.size).toBe(25_000);
    expect(elapsed).toBeLessThan(5_000);
  });

  it('returns semantic filter feedback in under 200 milliseconds', () => {
    const projection = benchmarkProjection();
    const started = performance.now();
    const visible = visibleProjection(projection, filters('Object 9999'));
    const elapsed = performance.now() - started;
    expect(visible.nodeStatus.get('urn:benchmark:object:9999')).toBe('match');
    expect(elapsed).toBeLessThan(200);
  });
});
