import type { MultiDirectedGraph } from 'graphology';
import type { Projection, Selection, Theme, VisibleProjection } from '../../shared/types';
import { GraphCanvas } from './GraphCanvas';
import { GraphTableView } from './GraphTableView';

export type CenterView = 'graph' | 'table';

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
}

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
}: GraphPaneProps) {
  return (
    <section className="graph-pane" aria-label="Graph and table views">
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
        </>
      )}
      {!loading && !graph && !error && <div className="loading">No valid state is available.</div>}
    </section>
  );
}
