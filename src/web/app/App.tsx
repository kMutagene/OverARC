import { useMemo, useState, type CSSProperties } from 'react';
import { GraphPane } from '../features/graph/GraphPane';
import {
  buildGraph,
  filterOptions,
  visibleCsv,
  visibleProjection,
} from '../features/graph/graphModel';
import { Inspector } from '../features/inspector/Inspector';
import { useElementSelection } from '../features/inspector/useElementSelection';
import { PaneResizer } from '../features/layout/PaneResizer';
import { usePaneLayout } from '../features/layout/usePaneLayout';
import { useTheme } from '../features/theme/useTheme';
import { emptyFilters } from '../features/workspace/filterModel';
import { useWorkspace } from '../features/workspace/useWorkspace';
import { WorkspaceSidebar } from '../features/workspace/WorkspaceSidebar';
import { downloadText } from '../shared/download';
import type { Filters, VisibleProjection } from '../shared/types';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const panes = usePaneLayout();
  const workspace = useWorkspace();
  const selection = useElementSelection(workspace.activeState, workspace.projection);
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const visible = useMemo<VisibleProjection>(
    () =>
      workspace.projection
        ? visibleProjection(workspace.projection, filters)
        : { nodeStatus: new Map(), relationStatus: new Map() },
    [filters, workspace.projection],
  );
  const graph = useMemo(
    () => (workspace.projection ? buildGraph(workspace.projection, visible) : null),
    [visible, workspace.projection],
  );
  const options = useMemo(
    () =>
      workspace.projection
        ? filterOptions(workspace.projection)
        : { kinds: [], types: [], predicates: [] },
    [workspace.projection],
  );
  const termLabels = useMemo(
    () => new Map(workspace.projection?.terms.map((term) => [term.id, term.label]) ?? []),
    [workspace.projection],
  );

  const exportCsv = () => {
    if (!workspace.projection) return;
    const csv = visibleCsv(workspace.projection, visible);
    downloadText(`${workspace.activeState}-nodes.csv`, csv.nodes, 'text/csv;charset=utf-8');
    downloadText(`${workspace.activeState}-relations.csv`, csv.relations, 'text/csv;charset=utf-8');
  };

  return (
    <main
      ref={panes.workbenchRef}
      className="workbench"
      style={
        {
          '--left-pane-width': `${panes.left.width}px`,
          '--right-pane-width': `${panes.right.width}px`,
        } as CSSProperties
      }
    >
      <WorkspaceSidebar
        workspace={workspace.workspace}
        activeState={workspace.activeState}
        projection={workspace.projection}
        visible={visible}
        filters={filters}
        options={options}
        termLabels={termLabels}
        theme={theme}
        collapsed={panes.left.width === 0}
        onChooseState={workspace.chooseState}
        onRefresh={() => void workspace.refresh()}
        onFiltersChange={setFilters}
        onExportCsv={exportCsv}
        onToggleTheme={toggleTheme}
      />
      <PaneResizer side="left" {...panes.left} />
      <GraphPane
        graph={graph}
        projection={workspace.projection}
        visible={visible}
        error={selection.error ?? workspace.error}
        loading={workspace.loading}
        resetToken={workspace.resetToken}
        theme={theme}
        selected={selection.selected}
        onSelect={selection.select}
      />
      <PaneResizer side="right" {...panes.right} />
      <Inspector
        detail={selection.detail}
        loading={selection.loading}
        collapsed={panes.right.width === 0}
        onClear={selection.clear}
      />
    </main>
  );
}
