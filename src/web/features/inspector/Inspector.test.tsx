import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Inspector } from './Inspector';
import type { ElementDetail } from '../../shared/types';

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
  it('keeps curator values visible and exact technical metadata on demand', () => {
    render(<Inspector detail={detail} loading={false} />);
    expect(screen.getByRole('heading', { name: 'SAMTEST001' })).toBeVisible();
    expect(screen.getByText('9223372036854775807')).toBeVisible();
    expect(screen.getByText('22 degree Celsius')).toBeVisible();
    expect(screen.getByText('urn:evidence:paper')).toBeVisible();
    expect(screen.getByText('urn:source:record')).toBeVisible();
    expect(screen.getByText('#/annotation')).not.toBeVisible();

    const annotation = screen.getByText('Measurement').closest('article')!;
    fireEvent.click(within(annotation).getByText('Technical details'));
    expect(screen.getByText('#/annotation')).toBeVisible();
    expect(screen.getByText('#/annotation/value')).toBeVisible();

    fireEvent.click(screen.getAllByText('Technical details')[0]);
    expect(screen.getByText('urn:object:sample/ä~1')).toBeVisible();
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
    expect(screen.getByRole('heading', { name: /Introduced by relations/ })).toBeVisible();
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
    expect(inspector.getAllByText('urn:object:source')[0]).toBeVisible();
    expect(inspector.getAllByText('urn:object:target')[0]).toBeVisible();
    expect(inspector.getByText('Value selector')).not.toBeVisible();
    fireEvent.click(inspector.getByText('Technical details'));
    expect(inspector.getByText('Value selector')).toBeVisible();
    expect(inspector.queryByRole('heading', { name: /Properties/ })).not.toBeInTheDocument();
  });

  it('lets curators collapse dense inspector sections', () => {
    const view = render(<Inspector detail={detail} loading={false} />);
    const inspector = within(view.container);
    const heading = inspector.getByRole('heading', { name: /Properties 1/ });
    const disclosure = heading.closest('details');
    expect(disclosure).toHaveAttribute('open');

    fireEvent.click(heading.closest('summary')!);

    expect(disclosure).not.toHaveAttribute('open');
  });

  it('explains when the selected element is hidden by filters', () => {
    render(<Inspector detail={detail} loading={false} hiddenByFilters />);
    expect(screen.getByText(/hidden by the current filters/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'SAMTEST001' })).toBeVisible();
  });

  it('offers typed mapping actions only for exact string property and annotation occurrences', () => {
    const onMapLiteral = vi.fn();
    render(
      <Inspector
        loading={false}
        onMapLiteral={onMapLiteral}
        detail={{
          ...detail,
          properties: [
            ...detail.properties,
            {
              id: 'urn:assertion:title',
              predicateId: 'urn:predicate:title',
              predicateLabel: 'Title',
              value: { type: 'string', display: 'control', text: 'control' },
              selector: '#/title',
              valueSelector: '#/title/value',
              annotations: [],
            },
          ],
          annotations: [
            {
              id: 'urn:annotation:note',
              propertyId: 'urn:predicate:note',
              propertyLabel: 'Note',
              value: {
                type: 'literal',
                display: 'untreated',
                literal: { type: 'string', display: 'untreated', text: 'untreated' },
              },
              selector: '#/note',
              valueSelector: '#/note/value',
            },
          ],
        }}
      />,
    );

    const actions = screen.getAllByRole('button', { name: 'Map to term' });
    expect(actions).toHaveLength(2);
    actions[0].click();
    actions[1].click();
    expect(onMapLiteral).toHaveBeenNthCalledWith(1, {
      selector: '#/title/value',
      literal: 'control',
      context: 'SAMTEST001 · Title',
    });
    expect(onMapLiteral).toHaveBeenNthCalledWith(2, {
      selector: '#/note/value',
      literal: 'untreated',
      context: 'SAMTEST001 · Note annotation',
    });
  });
});
