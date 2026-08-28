import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Projection, Term } from '../../shared/types';
import { TermsView } from './TermsView';

function term(index: number): Term {
  return {
    id: `urn:test:term:${String(index).padStart(3, '0')}`,
    label: `Term ${index}`,
    name: `Term ${index}`,
    source: index % 2 === 0 ? 'Source A' : 'Source B',
    selector: `#/terms/${index}`,
    usageCount: index,
    usageRoles: index % 2 === 0 ? ['objectType'] : ['relationPredicate'],
  };
}

function projection(count = 3): Projection {
  return {
    stateId: 'state',
    sha256: 'digest',
    terms: Array.from({ length: count }, (_, index) => term(index)),
    nodes: [],
    relations: [],
  };
}

describe('TermsView', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('searches and filters terms without changing exact inspect or copy identities', async () => {
    const onSelect = vi.fn();
    const state = projection();
    render(<TermsView projection={state} active onSelect={onSelect} />);

    expect(screen.getByText('3 of 3 terms')).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText('Search terms…'), { target: { value: 'Term 1' } });
    expect(screen.getByText('1 of 3 terms')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect term Term 1' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'term', id: state.terms[1].id });
    fireEvent.click(screen.getByRole('button', { name: 'Copy exact identifier for Term 1' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(state.terms[1].id));

    fireEvent.change(screen.getByPlaceholderText('Search terms…'), {
      target: { value: 'not registered' },
    });
    expect(screen.getByText('No terms match the current term filters.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reset term filters' }));
    fireEvent.click(screen.getByText('Sources', { selector: 'summary' }));
    fireEvent.click(screen.getByLabelText('Source A'));
    expect(screen.getByText('2 of 3 terms')).toBeVisible();
    fireEvent.click(screen.getByText('Roles', { selector: 'summary' }));
    fireEvent.click(screen.getByLabelText('Object type'));
    expect(screen.getByText('2 of 3 terms')).toBeVisible();
  });

  it('sorts before pagination and renders at most one hundred term rows', () => {
    render(<TermsView projection={projection(101)} active onSelect={() => undefined} />);

    expect(screen.getAllByRole('button', { name: /Inspect term/ })).toHaveLength(100);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 2')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Inspect term/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Usages, ascending' }));
    expect(screen.getByText('Page 1 of 2')).toBeVisible();
    expect(screen.getByRole('columnheader', { name: /Usages/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Usages, descending' }));
    expect(screen.getByRole('button', { name: 'Inspect term Term 100' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Usages sort' }));
    expect(screen.getByRole('button', { name: 'Inspect term Term 0' })).toBeVisible();
  });
});
