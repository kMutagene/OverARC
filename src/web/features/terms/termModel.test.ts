import { describe, expect, it } from 'vitest';
import type { Term } from '../../shared/types';
import { emptyTermFilters, filterTerms, sortTerms, termFilterOptions } from './termModel';

const terms: Term[] = [
  {
    id: 'urn:test:term:zeta',
    label: 'Café term',
    name: 'Café term',
    source: 'Source B',
    selector: '#/zeta',
    usageCount: 2,
    usageRoles: ['termValue', 'unit'],
  },
  {
    id: 'urn:test:term:alpha',
    label: 'Alpha',
    name: 'Alpha',
    source: 'Source A',
    selector: '#/alpha',
    usageCount: 1,
    usageRoles: ['objectType'],
  },
  {
    id: 'urn:test:term:unused',
    label: 'Unused',
    name: null,
    source: null,
    selector: '#/unused',
    usageCount: 0,
    usageRoles: [],
  },
];

describe('termModel', () => {
  it('normalizes Unicode and combines source and role filters with AND', () => {
    expect(filterTerms(terms, { ...emptyTermFilters(), query: 'CAFE' })).toEqual([terms[0]]);
    expect(
      filterTerms(terms, {
        query: '',
        sources: new Set(['Source B', 'Source A']),
        roles: new Set(['unit']),
      }),
    ).toEqual([terms[0]]);
  });

  it('collects complete options and sorts display values with exact-IRI ties', () => {
    expect(termFilterOptions(terms)).toEqual({
      sources: ['', 'Source A', 'Source B'],
      roles: ['objectType', 'termValue', 'unit'],
    });
    expect(
      sortTerms(terms, { column: 'usageCount', direction: 'descending' }).map((term) => term.id),
    ).toEqual(['urn:test:term:zeta', 'urn:test:term:alpha', 'urn:test:term:unused']);

    const tied = terms.map((term) => ({ ...term, name: 'Same' }));
    expect(
      sortTerms(tied, { column: 'name', direction: 'descending' }).map((term) => term.id),
    ).toEqual(['urn:test:term:alpha', 'urn:test:term:unused', 'urn:test:term:zeta']);
  });
});
