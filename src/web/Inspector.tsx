import type { Annotation, ArcValue, ElementDetail } from './types';

function Iri({ value }: { value: string }) {
  const linkable = /^(https?:)/.test(value);
  return linkable ? (
    <a href={value} target="_blank" rel="noreferrer">
      {value}
    </a>
  ) : (
    <code>{value}</code>
  );
}

function Value({ value }: { value: ArcValue }) {
  if (value.items) {
    return (
      <ul>
        {value.items.map((item, index) => (
          <li key={index}>
            <Value value={item} />
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

function AnnotationList({ annotations }: { annotations: Annotation[] }) {
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

export function Inspector({ detail, loading }: { detail: ElementDetail | null; loading: boolean }) {
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
      <header>
        <span className="eyebrow">{detail.kind}</span>
        <h2>{detail.label}</h2>
      </header>
      <dl>
        <dt>Exact IRI</dt>
        <dd>
          <Iri value={detail.id} />
        </dd>
        <dt>Selector</dt>
        <dd>
          <code>{detail.selector}</code>
        </dd>
        {detail.objectKind && (
          <>
            <dt>Kind</dt>
            <dd>{detail.objectKind}</dd>
          </>
        )}
        {detail.subject && (
          <>
            <dt>Subject</dt>
            <dd>
              <Iri value={detail.subject} />
            </dd>
          </>
        )}
        {detail.predicateId && (
          <>
            <dt>Predicate</dt>
            <dd>
              {detail.predicateLabel}
              <br />
              <Iri value={detail.predicateId} />
            </dd>
          </>
        )}
        {detail.object && (
          <>
            <dt>Object</dt>
            <dd>
              <Iri value={detail.object} />
            </dd>
          </>
        )}
      </dl>
      {detail.types.length > 0 && (
        <section>
          <h3>Type assertions</h3>
          {detail.types.map((type) => (
            <article key={type.id}>
              <strong>{type.termLabel}</strong>
              <br />
              <Iri value={type.termId} />
              <br />
              <code>{type.selector}</code>
            </article>
          ))}
        </section>
      )}
      <section>
        <h3>
          Properties <small>{detail.properties.length}</small>
        </h3>
        {detail.properties.length === 0 && <p>None</p>}
        {detail.properties.map((property) => (
          <article key={property.id}>
            <strong>{property.predicateLabel}</strong>
            <p>
              <Value value={property.value} />
            </p>
            <details>
              <summary>Assertion identifiers</summary>
              <dl>
                <dt>ID</dt>
                <dd>
                  <Iri value={property.id} />
                </dd>
                <dt>Predicate</dt>
                <dd>
                  <Iri value={property.predicateId} />
                </dd>
                <dt>Selector</dt>
                <dd>
                  <code>{property.selector}</code>
                </dd>
                <dt>Value selector</dt>
                <dd>
                  <code>{property.valueSelector}</code>
                </dd>
              </dl>
            </details>
            <AnnotationList annotations={property.annotations} />
          </article>
        ))}
      </section>
      <section>
        <h3>
          Annotations <small>{detail.annotations.length}</small>
        </h3>
        <AnnotationList annotations={detail.annotations} />
        {detail.annotations.length === 0 && <p>None</p>}
      </section>
    </aside>
  );
}
