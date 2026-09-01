import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphControls } from './GraphControls';

/** Supplies inert graph commands while allowing individual controls to be observed. */
function props(overrides: Partial<Parameters<typeof GraphControls>[0]> = {}) {
  return {
    layoutRunning: false,
    labelsVisible: false,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFocusAll: vi.fn(),
    onToggleLayout: vi.fn(),
    onToggleLabels: vi.fn(),
    onResetLayout: vi.fn(),
    onExportPng: vi.fn(),
    ...overrides,
  };
}

describe('GraphControls', () => {
  it('exposes explicit all-label visibility without changing other graph commands', () => {
    const onToggleLabels = vi.fn();
    const view = render(<GraphControls {...props({ onToggleLabels })} />);

    const show = screen.getByRole('button', { name: 'Show labels' });
    expect(show).toHaveAttribute('aria-pressed', 'false');
    show.click();
    expect(onToggleLabels).toHaveBeenCalledOnce();

    view.rerender(<GraphControls {...props({ labelsVisible: true, onToggleLabels })} />);
    expect(screen.getByRole('button', { name: 'Hide labels' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
