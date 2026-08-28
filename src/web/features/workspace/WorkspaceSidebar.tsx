import type {
  CurationDraft,
  Filters,
  Projection,
  StateSummary,
  Theme,
  VisibleProjection,
  Workspace,
} from '../../shared/types';
import { CurationStatus } from '../curation/CurationStatus';
import { ThemeToggle } from '../theme/ThemeToggle';
import { FilterPanel } from './FilterPanel';
import { GraphSummary } from './GraphSummary';
import { StateList } from './StateList';

/** Composition inputs for the workspace, filter, legend, export, and theme sidebar. */
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
  activeSummary: StateSummary | null;
  draft: CurationDraft | null;
  curationError: string | null;
  notice: string | null;
  mutating: boolean;
  onChooseState: (id: string) => void;
  onRefresh: () => void;
  onFiltersChange: (filters: Filters) => void;
  onExportCsv: () => void;
  onToggleTheme: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onDismissNotice: () => void;
}

/** Composes all left-pane controls and hides them from accessibility APIs when collapsed. */
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
  activeSummary,
  draft,
  curationError,
  notice,
  mutating,
  onChooseState,
  onRefresh,
  onFiltersChange,
  onExportCsv,
  onToggleTheme,
  onSave,
  onDiscard,
  onDismissNotice,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={`sidebar ${collapsed ? 'pane-collapsed' : ''}`}
      aria-label="Workspace and filters"
      aria-hidden={collapsed || undefined}
    >
      <header className="app-header">
        <div>
          <p className="eyebrow">ArcIR curation workbench</p>
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
      <CurationStatus
        state={activeSummary}
        draft={draft}
        notice={notice}
        error={curationError}
        busy={mutating}
        onSave={onSave}
        onDiscard={onDiscard}
        onDismissNotice={onDismissNotice}
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
