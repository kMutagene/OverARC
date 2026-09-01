import type { LucideIcon } from 'lucide-react';

/** Describes one labelled icon action rendered in the sidebar toolbar. */
export interface SidebarToolbarAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onActivate?: () => void;
}

/** Renders an extensible row of accessible icon actions below the workspace subtitle. */
export function SidebarToolbar({ actions }: { actions: readonly SidebarToolbarAction[] }) {
  return (
    <div className="sidebar-toolbar" role="toolbar" aria-label="Workspace toolbar">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            type="button"
            className="outline compact sidebar-toolbar-button"
            key={action.id}
            aria-label={action.label}
            title={action.label}
            onClick={action.onActivate}
          >
            <Icon aria-hidden="true" focusable="false" size={18} strokeWidth={1.8} />
          </button>
        );
      })}
    </div>
  );
}
