import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Inspector } from './Inspector';
import type { ElementDetail } from './types';

const detail: ElementDetail = {
  kind: 'object',
  id: 'urn:object:sample/ä~1',
  label: 'SAMTEST001',
  selector: '#/graph/objects/urn:object:sample~1ä~01',
  objectKind: 'observable',
  types: [
    {
      id: 'urn:type-assertion:1',
      termId: 'urn:type:sample',
      termLabel: 'BioSample',
      selector: '#/type',
    },
  ],
  properties: [
    {
      id: 'urn:assertion:count',
      predicateId: 'urn:predicate:count',
      predicateLabel: 'Read count',
      value: { type: 'integer', display: '9223372036854775807', text: '9223372036854775807' },
      selector: '#/property',
      valueSelector: '#/property/value',
      annotations: [
        {
          id: 'urn:annotation:unit',
          propertyId: 'urn:predicate:measurement',
          propertyLabel: 'Measurement',
          value: { type: 'literalWithUnit', display: '22 degree Celsius' },
          evidence: 'urn:evidence:paper',
          source: 'urn:source:record',
          selector: '#/annotation',
          valueSelector: '#/annotation/value',
        },
      ],
    },
  ],
  annotations: [],
};

describe('Inspector', () => {
  it('renders exact IDs, selectors, values, nested annotations, evidence, and sources', () => {
    render(<Inspector detail={detail} loading={false} />);
    expect(screen.getByRole('heading', { name: 'SAMTEST001' })).toBeVisible();
    expect(screen.getByText('urn:object:sample/ä~1')).toBeVisible();
    expect(screen.getByText('9223372036854775807')).toBeVisible();
    expect(screen.getByText('22 degree Celsius')).toBeVisible();
    expect(screen.getByText('urn:evidence:paper')).toBeVisible();
    expect(screen.getByText('urn:source:record')).toBeVisible();
    expect(screen.getByText('#/annotation')).toBeVisible();
  });
});
