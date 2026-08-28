import { IdentifierView } from '../../shared/IdentifierView';
import type { IdentifierLabels } from '../../shared/identifierModel';
import type { Annotation, ArcValue } from '../../shared/types';

export function ArcValueView({ value, labels }: { value: ArcValue; labels: IdentifierLabels }) {
  if (value.items) {
    return (
      <ul>
        {value.items.map((item, index) => (
          <li key={index}>
            <ArcValueView value={item} labels={labels} />
          </li>
        ))}
      </ul>
    );
  }
  if ((value.type === 'iri' || value.type === 'ref') && value.text) {
    return (
      <span>
        <span className="value-kind">{value.type}</span>{' '}
        <IdentifierView value={value.text} labels={labels} label={value.display} />
      </span>
    );
  }
  return (
    <span>
      <span className="value-kind">{value.type}</span> {value.display}
    </span>
  );
}

export function AnnotationList({
  annotations,
  labels,
}: {
  annotations: Annotation[];
  labels: IdentifierLabels;
}) {
  if (annotations.length === 0) return null;
  return (
    <div className="nested-annotations">
      <strong>Annotations</strong>
      {annotations.map((annotation) => (
        <article className="annotation-card" key={annotation.id}>
          <strong>{annotation.propertyLabel}</strong>
          <p>{annotation.value.display}</p>
          {annotation.evidence && (
            <dl className="annotation-provenance">
              <dt>Evidence</dt>
              <dd>
                <IdentifierView value={annotation.evidence} labels={labels} />
              </dd>
            </dl>
          )}
          {annotation.source && (
            <dl className="annotation-provenance">
              <dt>Source</dt>
              <dd>
                <IdentifierView value={annotation.source} labels={labels} />
              </dd>
            </dl>
          )}
          <details className="technical-details">
            <summary>Technical details</summary>
            <dl>
              <dt>Annotation ID</dt>
              <dd>
                <IdentifierView value={annotation.id} exact />
              </dd>
              <dt>Property IRI</dt>
              <dd>
                <IdentifierView value={annotation.propertyId} exact />
              </dd>
              {annotation.value.termId && (
                <>
                  <dt>Value term</dt>
                  <dd>
                    <IdentifierView value={annotation.value.termId} exact />
                  </dd>
                </>
              )}
              {annotation.value.unitId && (
                <>
                  <dt>Unit</dt>
                  <dd>
                    <IdentifierView value={annotation.value.unitId} exact />
                  </dd>
                </>
              )}
              <dt>Selector</dt>
              <dd>
                <code>{annotation.selector}</code>
              </dd>
              <dt>Value selector</dt>
              <dd>
                <code>{annotation.valueSelector}</code>
              </dd>
            </dl>
          </details>
        </article>
      ))}
    </div>
  );
}
