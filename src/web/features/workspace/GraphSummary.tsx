import type { Projection, VisibleProjection } from '../../shared/types';
import { objectKindColor } from '../graph/graphModel';

/** Visible counts, legend inputs, and CSV action displayed in the workspace sidebar. */
interface GraphSummaryProps {
  projection: Projection | null;
  visible: VisibleProjection;
  kinds: string[];
  onExportCsv: () => void;
}

/** Summarizes the filtered graph and explains object-kind and relation/reference visual encodings. */
export function GraphSummary({ projection, visible, kinds, onExportCsv }: GraphSummaryProps) {
  return (
    <section>
      <h2>Visible graph</h2>
      <p>
        <strong>{visible.nodeStatus.size}</strong> objects ·{' '}
        <strong>{visible.relationStatus.size}</strong> relations
      </p>
      <h3 className="legend-heading">ArcIR object kinds</h3>
      <div className="legend" aria-label="ArcIR object kind colors">
        {kinds.map((kind) => (
          <span key={kind}>
            <i style={{ backgroundColor: objectKindColor(kind) }} /> {kind}
          </span>
        ))}
        {projection?.nodes.some((node) => node.isPlaceholder) && (
          <span>
            <i style={{ backgroundColor: objectKindColor(null) }} /> unresolved ID
          </span>
        )}
      </div>
      <p className="legend-note">
        Dimmed nodes provide one-hop context. Solid arrows are ArcRelations;{' '}
        <span className="reference-line" /> purple arrows are view-only ArcValue.Ref links.
      </p>
      <button type="button" className="secondary" disabled={!projection} onClick={onExportCsv}>
        Export CSV pair
      </button>
    </section>
  );
}
