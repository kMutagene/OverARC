import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('provides an explicit way to clear the selection', () => {
    const onClear = vi.fn();
    render(<Inspector detail={detail} loading={false} onClear={onClear} />);
    screen.getByRole('button', { name: 'Clear selection' }).click();
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('explains projection-only nodes and the relations that introduced them', () => {
    render(
      <Inspector
        loading={false}
        detail={{
          kind: 'object',
          id: 'urn:object:missing',
          label: 'urn:object:missing',
          selector: '',
          isPlaceholder: true,
          placeholderReferences: [
            {
              relationId: 'urn:relation:contains',
              relationLabel: 'contains',
              endpoint: 'object',
              otherId: 'urn:object:project',
            },
          ],
          types: [],
          properties: [],
          annotations: [],
        }}
      />,
    );

    expect(screen.getByText(/contains no ArcIR object/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Introduced by relations' })).toBeVisible();
    expect(screen.getByText('urn:relation:contains')).toBeVisible();
  });

  it('identifies a derived reference edge without presenting it as an ArcRelation', () => {
    const view = render(
      <Inspector
        loading={false}
        detail={{
          kind: 'relation',
          id: 'urn:view:reference:1',
          label: 'ArcValue.Ref reference',
          selector: '#/graph/objects/source/properties/reference/value',
          isDerivedReference: true,
          subject: 'urn:object:source',
          predicateId: 'urn:predicate:reference',
          predicateLabel: 'Related publication',
          object: 'urn:object:target',
          types: [],
          properties: [],
          annotations: [],
        }}
      />,
    );

    const inspector = within(view.container);
    expect(inspector.getByText(/It is not an ArcRelation/)).toBeVisible();
    expect(inspector.getByText('urn:object:source')).toBeVisible();
    expect(inspector.getByText('urn:object:target')).toBeVisible();
    expect(inspector.getByText('Value selector')).toBeVisible();
    expect(inspector.queryByRole('heading', { name: /Properties/ })).not.toBeInTheDocument();
  });
});
