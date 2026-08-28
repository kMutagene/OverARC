import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TermDetail } from '../../shared/types';
import { TermInspector } from './TermInspector';

function detail(count = 2): TermDetail {
  return {
    id: 'http://example.org/term/sample',
    label: 'Sample',
    name: 'Sample',
    source: 'Example ontology',
    selector: '#/graph/terms/http:~1~1example.org~1term~1sample',
    usageCount: count,
    usageRoles: ['objectType'],
    usages: Array.from({ length: count }, (_, index) => ({
      role: 'objectType' as const,
      ownerKind: 'object' as const,
      ownerId: `urn:test:object:${index}`,
      ownerLabel: `Object ${index}`,
      occurrenceId: `urn:test:assertion:${index}`,
      selector: `#/graph/objects/${index}/types/${index}`,
    })),
  };
}

describe('TermInspector', () => {
  it('shows curator metadata and keeps exact identity details collapsed', () => {
    const onClear = vi.fn();
    render(<TermInspector detail={detail()} onClear={onClear} />);

    expect(screen.getByRole('heading', { name: 'Sample' })).toBeVisible();
    expect(screen.getByText('Object type (2)')).toBeVisible();
    const technical = screen.getByText('Technical details').closest('details');
    expect(technical).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('bounds rendered occurrences while keeping every page reachable', () => {
    const { container } = render(<TermInspector detail={detail(101)} />);
    expect(container.querySelectorAll('.term-usages article')).toHaveLength(100);
    expect(screen.getByText('Page 1 of 2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(container.querySelectorAll('.term-usages article')).toHaveLength(1);
    expect(screen.getByText('Object 100')).toBeVisible();
  });

  it('keeps an unused definition with no source inspectable', () => {
    render(
      <TermInspector
        detail={{
          ...detail(0),
          name: null,
          source: null,
          usageRoles: [],
          usages: [],
        }}
      />,
    );

    expect(screen.getByText('Not specified')).toBeVisible();
    expect(screen.getByText('Unused')).toBeVisible();
    expect(
      screen.getByText('This term is registered in the state but is not currently used.'),
    ).toBeVisible();
  });
});
