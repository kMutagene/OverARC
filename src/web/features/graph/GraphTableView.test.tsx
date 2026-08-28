import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphNode, Projection, VisibleProjection } from '../../shared/types';
import { GraphTableView } from './GraphTableView';

function node(index: number): GraphNode {
  return {
    id: `urn:biofsharp:insdc:object:N${index}`,
    label: `Node ${index}`,
    kind: 'observable',
    typeIds: ['urn:type:sample'],
    searchText: '',
    isPlaceholder: false,
    selector: `#/node/${index}`,
  };
}

function fixture(count = 2): { projection: Projection; visible: VisibleProjection } {
  const nodes = Array.from({ length: count }, (_, index) => node(index));
  const projection: Projection = {
    stateId: 'state',
    sha256: 'hash',
    terms: [
      {
        id: 'urn:type:sample',
        label: 'Sample',
        name: 'Sample',
        source: null,
        selector: '#/term',
        usageCount: 1,
        usageRoles: ['objectType'],
      },
      {
        id: 'urn:predicate:contains',
        label: 'contains',
        name: 'contains',
        source: null,
        selector: '#/predicate',
        usageCount: 1,
        usageRoles: ['relationPredicate'],
      },
    ],
    nodes,
    relations:
      count < 2
        ? []
        : [
            {
              id: 'urn:biofsharp:arcir:relation:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
              label: 'contains',
              subject: nodes[0].id,
              predicateId: 'urn:predicate:contains',
              object: nodes[1].id,
              searchText: '',
              isDerived: false,
              selector: '#/relation',
            },
          ],
  };
  return {
    projection,
    visible: {
      nodeStatus: new Map(nodes.map((item) => [item.id, 'match' as const])),
      relationStatus: new Map(projection.relations.map((item) => [item.id, 'match' as const])),
    },
  };
}

describe('GraphTableView', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('uses selectable cells and separate exact inspect and copy actions', async () => {
    const onSelect = vi.fn();
    const { projection, visible } = fixture();
    render(<GraphTableView projection={projection} visible={visible} active onSelect={onSelect} />);

    expect(screen.getByRole('tab', { name: 'Objects 2' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Node 0').tagName).toBe('SPAN');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect object Node 0' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'object', id: projection.nodes[0].id });

    fireEvent.click(screen.getByRole('button', { name: 'Copy exact identifier for Node 0' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(projection.nodes[0].id));

    fireEvent.click(screen.getByRole('tab', { name: 'Relations 1' }));
    expect(screen.getByText('ArcRelation')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect relation contains' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'relation', id: projection.relations[0].id });
  });

  it('renders at most one hundred rows and pages through larger visible sets', () => {
    const { projection, visible } = fixture(101);
    render(
      <GraphTableView
        projection={projection}
        visible={visible}
        active
        onSelect={() => undefined}
      />,
    );

    expect(screen.getAllByRole('button', { name: /Inspect object/ })).toHaveLength(100);
    expect(screen.getByText('Page 1 of 2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByRole('button', { name: /Inspect object/ })).toHaveLength(1);
    expect(screen.getByText('Node 100')).toBeVisible();
  });

  it('sorts data columns in both directions and returns the tab to page one', () => {
    const { projection, visible } = fixture(101);
    projection.nodes[0].kind = 'alpha';
    projection.nodes[1].kind = 'zeta';
    render(
      <GraphTableView
        projection={projection}
        visible={visible}
        active
        onSelect={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 2')).toBeVisible();

    const kindHeader = screen.getByRole('columnheader', { name: /Kind/ });
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Kind, ascending' }));
    expect(kindHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByText('Page 1 of 2')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Inspect object/ })[0]).toHaveAccessibleName(
      'Inspect object Node 0',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Kind, descending' }));
    expect(kindHeader).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getAllByRole('button', { name: /Inspect object/ })[0]).toHaveAccessibleName(
      'Inspect object Node 1',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Kind sort' }));
    expect(kindHeader).not.toHaveAttribute('aria-sort');
    expect(screen.getAllByRole('button', { name: /Inspect object/ })[0]).toHaveAccessibleName(
      'Inspect object Node 0',
    );
  });
});
