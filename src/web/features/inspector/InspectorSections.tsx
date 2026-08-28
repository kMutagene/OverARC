import { IdentifierView } from '../../shared/IdentifierView';
import type { IdentifierLabels } from '../../shared/identifierModel';
import type { ElementDetail } from '../../shared/types';
import { AnnotationList, ArcValueView } from './DetailValues';

/** Shared exact detail and label lookup used by all inspector sections. */
interface SectionProps {
  detail: ElementDetail;
  labels: IdentifierLabels;
}

/** Renders the element summary and collapsed exact IDs/selectors. */
export function InspectorMetadata({ detail, labels }: SectionProps) {
  return (
    <>
      <dl className="inspector-summary">
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
              <IdentifierView value={detail.subject} labels={labels} />
            </dd>
          </>
        )}
        {detail.predicateId && (
          <>
            <dt>Predicate</dt>
            <dd>
              <IdentifierView
                value={detail.predicateId}
                labels={labels}
                label={detail.predicateLabel}
              />
            </dd>
          </>
        )}
        {detail.object && (
          <>
            <dt>Object</dt>
            <dd>
              <IdentifierView value={detail.object} labels={labels} />
            </dd>
          </>
        )}
      </dl>
      <details className="technical-details element-technical-details">
        <summary>Technical details</summary>
        <dl>
          <dt>Exact IRI</dt>
          <dd>
            <IdentifierView value={detail.id} exact />
          </dd>
          {detail.selector && (
            <>
              <dt>{detail.isDerivedReference ? 'Value selector' : 'Selector'}</dt>
              <dd>
                <code>{detail.selector}</code>
              </dd>
            </>
          )}
          {detail.subject && (
            <>
              <dt>Subject IRI</dt>
              <dd>
                <IdentifierView value={detail.subject} exact />
              </dd>
            </>
          )}
          {detail.predicateId && (
            <>
              <dt>Predicate IRI</dt>
              <dd>
                <IdentifierView value={detail.predicateId} exact />
              </dd>
            </>
          )}
          {detail.object && (
            <>
              <dt>Object IRI</dt>
              <dd>
                <IdentifierView value={detail.object} exact />
              </dd>
            </>
          )}
        </dl>
      </details>
    </>
  );
}

/** Explains every ArcRelation that caused a projection-only missing endpoint to exist. */
export function PlaceholderRelations({ detail, labels }: SectionProps) {
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
              <IdentifierView value={reference.relationId} labels={labels} />
            </dd>
            <dt>Other endpoint</dt>
            <dd>
              <IdentifierView value={reference.otherId} labels={labels} />
            </dd>
          </dl>
        </article>
      ))}
    </details>
  );
}

/** Renders object type assertions with compact labels and disclosed exact metadata. */
export function TypeAssertions({ detail, labels }: SectionProps) {
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
          <details className="technical-details">
            <summary>Technical details</summary>
            <dl>
              <dt>Assertion ID</dt>
              <dd>
                <IdentifierView value={type.id} exact />
              </dd>
              <dt>Term IRI</dt>
              <dd>
                <IdentifierView value={type.termId} labels={labels} exact />
              </dd>
              <dt>Selector</dt>
              <dd>
                <code>{type.selector}</code>
              </dd>
            </dl>
          </details>
        </article>
      ))}
    </details>
  );
}

/** Renders collapsible property and root-annotation sections for canonical ArcIR elements. */
export function AssertionSections({ detail, labels }: SectionProps) {
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
              <ArcValueView value={property.value} labels={labels} />
            </p>
            <details className="technical-details">
              <summary>Technical details</summary>
              <dl>
                <dt>Assertion ID</dt>
                <dd>
                  <IdentifierView value={property.id} exact />
                </dd>
                <dt>Predicate IRI</dt>
                <dd>
                  <IdentifierView value={property.predicateId} exact />
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
            <AnnotationList annotations={property.annotations} labels={labels} />
          </article>
        ))}
      </details>
      <details className="inspector-section" open key={`${detail.id}-annotations`}>
        <summary>
          <h3>
            Annotations <small>{detail.annotations.length}</small>
          </h3>
        </summary>
        <AnnotationList annotations={detail.annotations} labels={labels} />
        {detail.annotations.length === 0 && <p>None</p>}
      </details>
    </>
  );
}
