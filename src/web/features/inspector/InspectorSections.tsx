import type { ElementDetail } from '../../shared/types';
import { AnnotationList, ArcValueView, Iri } from './DetailValues';

export function InspectorMetadata({ detail }: { detail: ElementDetail }) {
  return (
    <dl>
      <dt>Exact IRI</dt>
      <dd>
        <Iri value={detail.id} />
      </dd>
      {detail.selector && (
        <>
          <dt>{detail.isDerivedReference ? 'Value selector' : 'Selector'}</dt>
          <dd>
            <code>{detail.selector}</code>
          </dd>
        </>
      )}
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
  );
}

export function PlaceholderRelations({ detail }: { detail: ElementDetail }) {
  if (!detail.isPlaceholder || !detail.placeholderReferences) return null;
  return (
    <details className="inspector-section" open key={`${detail.id}-relations`}>
      <summary>
        <h3>
          Introduced by relations <small>{detail.placeholderReferences.length}</small>
        </h3>
      </summary>
      {detail.placeholderReferences.map((reference) => (
        <article key={reference.relationId}>
          <strong>{reference.relationLabel}</strong>
          <dl>
            <dt>Endpoint</dt>
            <dd>{reference.endpoint}</dd>
            <dt>Relation</dt>
            <dd>
              <Iri value={reference.relationId} />
            </dd>
            <dt>Other endpoint</dt>
            <dd>
              <Iri value={reference.otherId} />
            </dd>
          </dl>
        </article>
      ))}
    </details>
  );
}

export function TypeAssertions({ detail }: { detail: ElementDetail }) {
  if (detail.types.length === 0) return null;
  return (
    <details className="inspector-section" open key={`${detail.id}-types`}>
      <summary>
        <h3>
          Type assertions <small>{detail.types.length}</small>
        </h3>
      </summary>
      {detail.types.map((type) => (
        <article key={type.id}>
          <strong>{type.termLabel}</strong>
          <br />
          <Iri value={type.termId} />
          <br />
          <code>{type.selector}</code>
        </article>
      ))}
    </details>
  );
}

export function AssertionSections({ detail }: { detail: ElementDetail }) {
  if (detail.isPlaceholder || detail.isDerivedReference) return null;
  return (
    <>
      <details className="inspector-section" open key={`${detail.id}-properties`}>
        <summary>
          <h3>
            Properties <small>{detail.properties.length}</small>
          </h3>
        </summary>
        {detail.properties.length === 0 && <p>None</p>}
        {detail.properties.map((property) => (
          <article key={property.id}>
            <strong>{property.predicateLabel}</strong>
            <p>
              <ArcValueView value={property.value} />
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
      </details>
      <details className="inspector-section" open key={`${detail.id}-annotations`}>
        <summary>
          <h3>
            Annotations <small>{detail.annotations.length}</small>
          </h3>
        </summary>
        <AnnotationList annotations={detail.annotations} />
        {detail.annotations.length === 0 && <p>None</p>}
      </details>
    </>
  );
}
