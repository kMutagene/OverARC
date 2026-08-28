import type { MultiDirectedGraph } from 'graphology';
import type {
  CurationDraft,
  Mappings,
  Projection,
  Selection,
  Theme,
  VisibleProjection,
} from '../../shared/types';
import { ChangesView } from '../curation/ChangesView';
import { MappingsView } from '../curation/MappingsView';
import { GraphCanvas } from './GraphCanvas';
import { GraphTableView } from './GraphTableView';
import { TermsView } from '../terms/TermsView';

/** Mutually exclusive first-class representations available in the center pane. */
export type CenterView = 'graph' | 'table' | 'terms' | 'mappings' | 'changes';

/** Shared state and commands needed by the center graph/table workspace. */
interface GraphPaneProps {
  graph: MultiDirectedGraph | null;
  projection: Projection | null;
  visible: VisibleProjection;
  error: string | null;
  loading: boolean;
  resetToken: number;
  theme: Theme;
  selected: Selection | null;
  activeView: CenterView;
  onViewChange: (view: CenterView) => void;
  onSelect: (selection: Selection | null) => void;
  mappings: Mappings | null;
  draft: CurationDraft | null;
  mutating: boolean;
  onUndo: (operationId: string) => void;
}

/** Hosts persistent graph, table, and term layers and switches the active accessible workspace. */
export function GraphPane({
  graph,
  projection,
  visible,
  error,
  loading,
  resetToken,
  theme,
  selected,
  activeView,
  onViewChange,
  onSelect,
  mappings,
  draft,
  mutating,
  onUndo,
}: GraphPaneProps) {
  return (
    <section className="graph-pane" aria-label="Graph, table, and term views">
      <nav className="center-view-switch" aria-label="Center view">
        <button
          type="button"
          className={activeView === 'graph' ? 'active' : 'secondary'}
          aria-pressed={activeView === 'graph'}
          onClick={() => onViewChange('graph')}
        >
          Graph
        </button>
        <button
          type="button"
          className={activeView === 'table' ? 'active' : 'secondary'}
          aria-pressed={activeView === 'table'}
          onClick={() => onViewChange('table')}
        >
          Table
        </button>
        <button
          type="button"
          className={activeView === 'terms' ? 'active' : 'secondary'}
          aria-pressed={activeView === 'terms'}
          onClick={() => onViewChange('terms')}
        >
          Terms
        </button>
        <button
          type="button"
          className={activeView === 'mappings' ? 'active' : 'secondary'}
          aria-pressed={activeView === 'mappings'}
          onClick={() => onViewChange('mappings')}
        >
          Mappings
        </button>
        <button
          type="button"
          className={activeView === 'changes' ? 'active' : 'secondary'}
          aria-pressed={activeView === 'changes'}
          onClick={() => onViewChange('changes')}
        >
          Changes {draft && <span>{draft.operations.length}</span>}
        </button>
      </nav>
      {error && (
        <div role="alert" className="error-banner">
          <strong>Unable to load</strong>
          <br />
          {error}
        </div>
      )}
      {loading && (
        <div className="loading" aria-busy="true">
          Loading ArcIR graph…
        </div>
      )}
      {!loading && graph && projection && (
        <>
          <div
            className={`center-view graph-view${activeView === 'graph' ? ' active' : ' inactive'}`}
            aria-hidden={activeView !== 'graph'}
            inert={activeView !== 'graph'}
          >
            <GraphCanvas
              graph={graph}
              visible={visible}
              resetToken={resetToken}
              theme={theme}
              active={activeView === 'graph'}
              selected={selected}
              onSelect={onSelect}
            />
          </div>
          <GraphTableView
            projection={projection}
            visible={visible}
            active={activeView === 'table'}
            onSelect={onSelect}
          />
          <TermsView projection={projection} active={activeView === 'terms'} onSelect={onSelect} />
          <MappingsView mappings={mappings} active={activeView === 'mappings'} />
          <ChangesView
            draft={draft}
            active={activeView === 'changes'}
            disabled={mutating}
            onUndo={onUndo}
          />
        </>
      )}
      {!loading && !graph && !error && <div className="loading">No valid state is available.</div>}
    </section>
  );
}
