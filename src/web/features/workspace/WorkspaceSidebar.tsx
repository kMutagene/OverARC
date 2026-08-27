import type { Filters, Projection, Theme, VisibleProjection, Workspace } from '../../shared/types';
import { ThemeToggle } from '../theme/ThemeToggle';
import { FilterPanel } from './FilterPanel';
import { GraphSummary } from './GraphSummary';
import { StateList } from './StateList';

interface WorkspaceSidebarProps {
  workspace: Workspace | null;
  activeState: string | null;
  projection: Projection | null;
  visible: VisibleProjection;
  filters: Filters;
  options: { kinds: string[]; types: string[]; predicates: string[] };
  termLabels: Map<string, string>;
  theme: Theme;
  collapsed: boolean;
  onChooseState: (id: string) => void;
  onRefresh: () => void;
  onFiltersChange: (filters: Filters) => void;
  onExportCsv: () => void;
  onToggleTheme: () => void;
}

export function WorkspaceSidebar({
  workspace,
  activeState,
  projection,
  visible,
  filters,
  options,
  termLabels,
  theme,
  collapsed,
  onChooseState,
  onRefresh,
  onFiltersChange,
  onExportCsv,
  onToggleTheme,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={`sidebar ${collapsed ? 'pane-collapsed' : ''}`}
      aria-label="Workspace and filters"
      aria-hidden={collapsed || undefined}
    >
      <header className="app-header">
        <div>
          <p className="eyebrow">Read-only ArcIR workbench</p>
          <h1>OverARC</h1>
          <p>{workspace?.name ?? 'Loading workspace…'}</p>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <StateList
        workspace={workspace}
        activeState={activeState}
        onChooseState={onChooseState}
        onRefresh={onRefresh}
      />
      <FilterPanel
        filters={filters}
        options={options}
        termLabels={termLabels}
        onChange={onFiltersChange}
      />
      <GraphSummary
        projection={projection}
        visible={visible}
        kinds={options.kinds}
        onExportCsv={onExportCsv}
      />
    </aside>
  );
}
