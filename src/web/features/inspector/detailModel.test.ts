import { describe, expect, it } from 'vitest';
import type { Projection } from '../../shared/types';
import { projectedDetail } from './detailModel';

const projection: Projection = {
  stateId: 'state',
  sha256: 'digest',
  terms: [
    {
      id: 'urn:predicate:reference',
      label: 'references',
      name: 'references',
      source: null,
      selector: '#/terms/reference',
    },
  ],
  nodes: [
    {
      id: 'urn:object:source',
      label: 'Source',
      kind: 'collection',
      typeIds: [],
      searchText: 'Source',
      isPlaceholder: false,
      selector: '#/source',
    },
    {
      id: 'urn:object:missing',
      label: 'urn:object:missing',
      kind: null,
      typeIds: [],
      searchText: 'urn:object:missing',
      isPlaceholder: true,
      selector: null,
    },
  ],
  relations: [
    {
      id: 'urn:view:reference',
      label: 'references',
      subject: 'urn:object:source',
      predicateId: 'urn:predicate:reference',
      object: 'urn:object:missing',
      searchText: '',
      isDerived: true,
      selector: '#/source/properties/reference/value',
    },
    {
      id: 'urn:relation:missing',
      label: 'contains',
      subject: 'urn:object:source',
      predicateId: 'urn:predicate:contains',
      object: 'urn:object:missing',
      searchText: '',
      isDerived: false,
      selector: '#/relations/missing',
    },
  ],
};

describe('projectedDetail', () => {
  it('describes view-only reference edges without requesting ArcRelation details', () => {
    expect(
      projectedDetail(projection, { kind: 'relation', id: 'urn:view:reference' }),
    ).toMatchObject({
      label: 'ArcValue.Ref reference',
      isDerivedReference: true,
      predicateLabel: 'references',
      subject: 'urn:object:source',
      object: 'urn:object:missing',
    });
  });

  it('explains every relation that introduces a projection-only placeholder', () => {
    const detail = projectedDetail(projection, { kind: 'object', id: 'urn:object:missing' });
    expect(detail?.isPlaceholder).toBe(true);
    expect(detail?.placeholderReferences).toEqual([
      {
        relationId: 'urn:view:reference',
        relationLabel: 'references',
        endpoint: 'object',
        otherId: 'urn:object:source',
      },
      {
        relationId: 'urn:relation:missing',
        relationLabel: 'contains',
        endpoint: 'object',
        otherId: 'urn:object:source',
      },
    ]);
  });

  it('leaves ordinary ArcIR elements to the detail endpoint', () => {
    expect(
      projectedDetail(projection, { kind: 'object', id: 'urn:object:source' }),
    ).toBeUndefined();
    expect(
      projectedDetail(projection, { kind: 'relation', id: 'urn:relation:missing' }),
    ).toBeUndefined();
  });
});
