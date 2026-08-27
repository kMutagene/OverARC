import type { Annotation, ArcValue } from '../../shared/types';

export function Iri({ value }: { value: string }) {
  return /^(https?:)/.test(value) ? (
    <a href={value} target="_blank" rel="noreferrer">
      {value}
    </a>
  ) : (
    <code>{value}</code>
  );
}

export function ArcValueView({ value }: { value: ArcValue }) {
  if (value.items) {
    return (
      <ul>
        {value.items.map((item, index) => (
          <li key={index}>
            <ArcValueView value={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <span>
      <span className="value-kind">{value.type}</span> {value.display}
    </span>
  );
}

export function AnnotationList({ annotations }: { annotations: Annotation[] }) {
  if (annotations.length === 0) return null;
  return (
    <div className="nested-annotations">
      <strong>Annotations</strong>
      {annotations.map((annotation) => (
        <dl key={annotation.id}>
          <dt>{annotation.propertyLabel}</dt>
          <dd>{annotation.value.display}</dd>
          <dt>ID</dt>
          <dd>
            <Iri value={annotation.id} />
          </dd>
          {annotation.evidence && (
            <>
              <dt>Evidence</dt>
              <dd>
                <Iri value={annotation.evidence} />
              </dd>
            </>
          )}
          {annotation.source && (
            <>
              <dt>Source</dt>
              <dd>
                <Iri value={annotation.source} />
              </dd>
            </>
          )}
          <dt>Selector</dt>
          <dd>
            <code>{annotation.selector}</code>
          </dd>
        </dl>
      ))}
    </div>
  );
}
