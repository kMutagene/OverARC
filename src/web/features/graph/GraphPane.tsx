import type { MultiDirectedGraph } from 'graphology';
import type { Projection, Selection, Theme, VisibleProjection } from '../../shared/types';
import { AccessibleGraphTable } from './AccessibleGraphTable';
import { GraphCanvas } from './GraphCanvas';

interface GraphPaneProps {
  graph: MultiDirectedGraph | null;
  projection: Projection | null;
  visible: VisibleProjection;
  error: string | null;
  loading: boolean;
  resetToken: number;
  theme: Theme;
  selected: Selection | null;
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
  onSelect,
}: GraphPaneProps) {
  return (
    <section className="graph-pane" aria-label="Graph view">
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
          <GraphCanvas
            graph={graph}
            resetToken={resetToken}
            theme={theme}
            selected={selected}
            onSelect={onSelect}
          />
          <AccessibleGraphTable projection={projection} visible={visible} onSelect={onSelect} />
        </>
      )}
      {!loading && !graph && !error && <div className="loading">No valid state is available.</div>}
    </section>
  );
}
