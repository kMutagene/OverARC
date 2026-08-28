import { useMemo, useState, type CSSProperties } from 'react';
import { GraphPane, type CenterView } from '../features/graph/GraphPane';
import { MappingDialog } from '../features/curation/MappingDialog';
import { UnsavedChangesDialog } from '../features/curation/UnsavedChangesDialog';
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
import type { Filters, LiteralOccurrence, VisibleProjection } from '../shared/types';

/** Composes the workbench and owns state shared by the workspace, graph/table, and inspector panes. */
export default function App() {
  const { theme, toggleTheme } = useTheme();
  const panes = usePaneLayout();
  const workspace = useWorkspace();
  const selection = useElementSelection(
    workspace.activeState,
    workspace.projection,
    workspace.draft?.id ?? null,
  );
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [centerView, setCenterView] = useState<CenterView>('graph');
  const [mappingOccurrence, setMappingOccurrence] = useState<LiteralOccurrence | null>(null);

  const visible = useMemo<VisibleProjection>(
    () =>
      workspace.projection
        ? visibleProjection(workspace.projection, filters)
        : { nodeStatus: new Map(), relationStatus: new Map() },
    [filters, workspace.projection],
  );
  const graph = useMemo(
    () => (workspace.projection ? buildGraph(workspace.projection) : null),
    [workspace.projection],
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
  const selectionHidden = Boolean(
    selection.selected &&
    selection.selected.kind !== 'term' &&
    (selection.selected.kind === 'object'
      ? !visible.nodeStatus.has(selection.selected.id)
      : !visible.relationStatus.has(selection.selected.id)),
  );

  /** Exports the currently visible nodes and relations as two exact-ID-preserving CSV files. */
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
        activeSummary={workspace.activeSummary}
        draft={workspace.draft}
        curationError={workspace.curationError}
        notice={workspace.notice}
        mutating={workspace.mutating}
        onChooseState={workspace.chooseState}
        onRefresh={() => void workspace.refresh()}
        onFiltersChange={setFilters}
        onExportCsv={exportCsv}
        onToggleTheme={toggleTheme}
        onSave={() => void workspace.saveDraft()}
        onDiscard={() => void workspace.discardDraft()}
        onDismissNotice={workspace.clearNotice}
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
        activeView={centerView}
        onViewChange={setCenterView}
        onSelect={selection.select}
        mappings={workspace.mappings}
        draft={workspace.draft}
        mutating={workspace.mutating}
        onUndo={(operationId) => void workspace.undoOperation(operationId)}
      />
      <PaneResizer side="right" {...panes.right} />
      <Inspector
        detail={selection.detail}
        termDetail={selection.termDetail}
        loading={selection.loading}
        projection={workspace.projection}
        hiddenByFilters={selectionHidden}
        collapsed={panes.right.width === 0}
        onClear={selection.clear}
        onMapLiteral={
          workspace.activeSummary?.editable
            ? (occurrence) => {
                workspace.clearCurationError();
                setMappingOccurrence(occurrence);
              }
            : undefined
        }
      />
      {mappingOccurrence && workspace.projection && (
        <MappingDialog
          occurrence={mappingOccurrence}
          terms={workspace.projection.terms}
          mappings={workspace.mappings}
          draft={workspace.draft}
          error={workspace.curationError}
          submitting={workspace.mutating}
          onCancel={() => {
            workspace.clearCurationError();
            setMappingOccurrence(null);
          }}
          onSubmit={(targetTermId, predicateId, curator) => {
            void workspace
              .addLiteralMapping(mappingOccurrence, targetTermId, predicateId, curator)
              .then((next) => {
                if (next) setMappingOccurrence(null);
              });
          }}
        />
      )}
      {workspace.pendingState && workspace.draft && (
        <UnsavedChangesDialog
          draft={workspace.draft}
          busy={workspace.mutating}
          onDecision={(decision) => void workspace.resolveStateSwitch(decision)}
        />
      )}
    </main>
  );
}
