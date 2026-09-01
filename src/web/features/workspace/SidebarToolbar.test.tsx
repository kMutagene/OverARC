import { FolderOpen, Settings } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarToolbar } from './SidebarToolbar';

describe('SidebarToolbar', () => {
  it('renders an extensible collection of labelled icon buttons', () => {
    render(
      <SidebarToolbar
        actions={[
          {
            id: 'open',
            label: 'Open OverARC workspace',
            icon: FolderOpen,
          },
          { id: 'settings', label: 'Settings', icon: Settings },
        ]}
      />,
    );

    expect(screen.getByRole('toolbar', { name: 'Workspace toolbar' })).toBeVisible();
    const open = screen.getByRole('button', { name: 'Open OverARC workspace' });
    expect(open).toHaveAttribute('title', 'Open OverARC workspace');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('title', 'Settings');
  });
});
