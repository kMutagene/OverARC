import type { ElementDetail } from '../../shared/types';
import {
  AssertionSections,
  InspectorMetadata,
  PlaceholderRelations,
  TypeAssertions,
} from './InspectorSections';

interface InspectorProps {
  detail: ElementDetail | null;
  loading: boolean;
  collapsed?: boolean;
  onClear?: () => void;
}

export function Inspector({ detail, loading, collapsed = false, onClear }: InspectorProps) {
  if (collapsed) return <aside className="inspector pane-collapsed" aria-hidden="true" />;
  if (loading)
    return (
      <aside className="inspector" aria-busy="true">
        <p>Loading details…</p>
      </aside>
    );
  if (!detail)
    return (
      <aside className="inspector empty">
        <p>Select an object or relation to inspect every assertion and annotation.</p>
      </aside>
    );

  return (
    <aside className="inspector" aria-label="Element inspector">
      <header className="inspector-header">
        <div>
          <span className="eyebrow">
            {detail.isPlaceholder
              ? 'Unresolved endpoint'
              : detail.isDerivedReference
                ? 'Derived reference edge'
                : detail.kind}
          </span>
          <h2>{detail.label}</h2>
        </div>
        {onClear && (
          <button
            type="button"
            className="outline compact"
            onClick={onClear}
            aria-label="Clear selection"
          >
            ×
          </button>
        )}
      </header>
      {detail.isPlaceholder && (
        <p className="placeholder-notice">
          This ID is used as a relation endpoint, but this state contains no ArcIR object with that
          ID. OverARC added this projection-only node so the incomplete relation remains visible.
        </p>
      )}
      {detail.isDerivedReference && (
        <p className="derived-reference-notice">
          This view-only edge comes from an ArcValue.Ref in the source object’s{' '}
          <strong>{detail.predicateLabel}</strong> property. It is not an ArcRelation and carries no
          relation assertions of its own.
        </p>
      )}
      <InspectorMetadata detail={detail} />
      <PlaceholderRelations detail={detail} />
      <TypeAssertions detail={detail} />
      <AssertionSections detail={detail} />
    </aside>
  );
}
