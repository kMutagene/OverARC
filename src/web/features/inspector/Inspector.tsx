import { useMemo } from 'react';
import { identifierLabels } from '../../shared/identifierModel';
import type { ElementDetail, Projection } from '../../shared/types';
import {
  AssertionSections,
  InspectorMetadata,
  PlaceholderRelations,
  TypeAssertions,
} from './InspectorSections';

/** Data and pane state required by the selected-element inspector. */
interface InspectorProps {
  detail: ElementDetail | null;
  loading: boolean;
  projection?: Projection | null;
  hiddenByFilters?: boolean;
  collapsed?: boolean;
  onClear?: () => void;
}

/** Renders complete object/relation details with progressive disclosure for technical identity data. */
export function Inspector({
  detail,
  loading,
  projection = null,
  hiddenByFilters = false,
  collapsed = false,
  onClear,
}: InspectorProps) {
  const labels = useMemo(() => identifierLabels(projection), [projection]);
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
      {hiddenByFilters && (
        <p className="filtered-selection-notice">
          This element is hidden by the current filters. Its details remain available until you
          clear the selection or switch states.
        </p>
      )}
      <InspectorMetadata detail={detail} labels={labels} />
      <PlaceholderRelations detail={detail} labels={labels} />
      <TypeAssertions detail={detail} labels={labels} />
      <AssertionSections detail={detail} labels={labels} />
    </aside>
  );
}
