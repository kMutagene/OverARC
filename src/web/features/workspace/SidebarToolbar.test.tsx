import { FolderOpen, Settings } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarToolbar } from './SidebarToolbar';

describe('SidebarToolbar', () => {
  it('renders extensible labelled icon actions and activates their handlers', () => {
    const onOpen = vi.fn();
    const onSettings = vi.fn();
    render(
      <SidebarToolbar
        actions={[
          {
            id: 'open',
            label: 'Open OverARC workspace',
            icon: FolderOpen,
            onActivate: onOpen,
          },
          { id: 'settings', label: 'Settings', icon: Settings, onActivate: onSettings },
        ]}
      />,
    );

    expect(screen.getByRole('toolbar', { name: 'Workspace toolbar' })).toBeVisible();
    const open = screen.getByRole('button', { name: 'Open OverARC workspace' });
    expect(open).toHaveAttribute('title', 'Open OverARC workspace');
    open.click();
    screen.getByRole('button', { name: 'Settings' }).click();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();
  });
});
