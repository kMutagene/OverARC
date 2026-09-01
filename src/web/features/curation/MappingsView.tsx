import type { Mappings, SssomField, SssomMapping } from '../../shared/types';

interface PrefixEntry {
  prefix: string;
  namespace: string;
}

const STANDARD_PREFIXES: PrefixEntry[] = [
  { prefix: 'skos', namespace: 'http://www.w3.org/2004/02/skos/core#' },
  { prefix: 'semapv', namespace: 'https://w3id.org/semapv/vocab/' },
  { prefix: 'rdfs', namespace: 'http://www.w3.org/2000/01/rdf-schema#' },
  { prefix: 'owl', namespace: 'http://www.w3.org/2002/07/owl#' },
];

const SUMMARY_FIELDS = new Set([
  'subject_label',
  'subject_type',
  'predicate_id',
  'object_label',
  'object_id',
  'object_type',
  'mapping_justification',
  'comment',
  'description',
]);

const ENTITY_TYPE_LABELS: Readonly<Record<string, string>> = {
  OwlAnnotationProperty: 'owl annotation property',
  OwlClass: 'owl class',
  OwlDataProperty: 'owl data property',
  OwlNamedIndividual: 'owl named individual',
  OwlObjectProperty: 'owl object property',
  RdfProperty: 'rdf property',
  RdfsClass: 'rdfs class',
  RdfsDatatype: 'rdfs datatype',
  RdfsLiteral: 'rdfs literal',
  RdfsResource: 'rdfs resource',
  SkosConcept: 'skos concept',
  ComposedEntityExpression: 'composed entity expression',
};

/** Returns all populated lexical values for one exact SSSOM slot name. */
function fieldValues(mapping: SssomMapping, name: string): string[] {
  return mapping.fields.find((candidate) => candidate.name === name)?.values ?? [];
}

/** Returns joined display text for one SSSOM slot, with an explicit empty marker. */
function field(mapping: SssomMapping, name: string): string {
  return fieldValues(mapping, name).join(' | ') || '—';
}

/** Reads declared CURIE prefixes and augments them with SSSOM's common semantic namespaces. */
function prefixEntries(mappings: Mappings): PrefixEntry[] {
  const entries = new Map(STANDARD_PREFIXES.map((entry) => [entry.prefix, entry.namespace]));
  const declarations = mappings.metadataFields.find((item) => item.name === 'curie_map')?.values;
  declarations?.forEach((declaration) => {
    const separator = declaration.indexOf(': ');
    if (separator > 0)
      entries.set(declaration.slice(0, separator), declaration.slice(separator + 2));
  });
  return [...entries].map(([prefix, namespace]) => ({ prefix, namespace }));
}

/** Compacts one expanded identifier to a declared CURIE while preserving unknown values exactly. */
function compactTerm(value: string, prefixes: PrefixEntry[]): string {
  const match = [...prefixes]
    .sort((left, right) => right.namespace.length - left.namespace.length)
    .find((entry) => value.startsWith(entry.namespace));
  return match ? `${match.prefix}:${value.slice(match.namespace.length)}` : value;
}

/** Resolves an HTTP(S) destination for an expanded identifier or recognized CURIE. */
function termHref(value: string, prefixes: PrefixEntry[]): string | null {
  if (/^https?:\/\//i.test(value)) return value;
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const namespace = prefixes.find((entry) => entry.prefix === value.slice(0, separator))?.namespace;
  const expanded = namespace ? `${namespace}${value.slice(separator + 1)}` : null;
  return expanded && /^https?:\/\//i.test(expanded) ? expanded : null;
}

/** Renders a compact identifier as a dereferenceable link when it resolves to HTTP(S). */
function TermLink({ value, prefixes }: { value: string; prefixes: PrefixEntry[] }) {
  const compact = compactTerm(value, prefixes);
  const href = termHref(value, prefixes);
  return href ? (
    <a className="mapping-term-link" href={href} target="_blank" rel="noreferrer" title={value}>
      <code>{compact}</code>
    </a>
  ) : (
    <code title={value}>{compact}</code>
  );
}

/** Converts codec union-case names into the lexical entity-type form used by SSSOM. */
function entityType(mapping: SssomMapping, name: 'subject_type' | 'object_type'): string | null {
  const value = fieldValues(mapping, name).join(' | ');
  return value ? (ENTITY_TYPE_LABELS[value] ?? value) : null;
}

/** Collects standard comments and description extensions for the compact row summary. */
function descriptions(mapping: SssomMapping): string[] {
  return ['comment', 'description'].flatMap((name) => fieldValues(mapping, name));
}

/** Renders a compact generic field list so imported standard and extension metadata remain visible. */
function FieldList({ fields }: { fields: SssomField[] }) {
  if (fields.length === 0) return <p>None</p>;
  return (
    <dl className="mapping-metadata-fields">
      {fields.map((item) => (
        <div key={item.name}>
          <dt>{item.name}</dt>
          <dd>{item.values.join(' | ')}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Displays mapping-set identity, retained metadata, and every current state or draft mapping row. */
export function MappingsView({ mappings, active }: { mappings: Mappings | null; active: boolean }) {
  const prefixes = mappings ? prefixEntries(mappings) : STANDARD_PREFIXES;
  return (
    <section
      className={`center-view mappings-view${active ? ' active' : ' inactive'}`}
      aria-label="SSSOM mappings"
      aria-hidden={!active}
      inert={!active}
    >
      {!mappings ? (
        <div className="curation-empty">No valid SSSOM mapping artifact is available.</div>
      ) : (
        <>
          <header className="mapping-header">
            <div>
              <span className="eyebrow">
                {mappings.isDraft ? 'Draft mappings' : 'Immutable mappings'}
              </span>
              <h2>{mappings.mappingSetId}</h2>
              <p>
                SSSOM {mappings.sssomVersion ?? 'unspecified'} · {mappings.mappings.length} records
              </p>
            </div>
            <details>
              <summary>Mapping-set metadata</summary>
              <FieldList fields={mappings.metadataFields} />
            </details>
          </header>
          <div className="mapping-table-content">
            <table>
              <caption className="visually-hidden">Current SSSOM mappings</caption>
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Predicate</th>
                  <th scope="col">Object</th>
                  <th scope="col">Justification</th>
                </tr>
              </thead>
              <tbody>
                {mappings.mappings.map((mapping) => {
                  const subjectType = entityType(mapping, 'subject_type');
                  const objectType = entityType(mapping, 'object_type');
                  const rowDescriptions = descriptions(mapping);
                  const additionalFields = mapping.fields.filter(
                    (item) => !SUMMARY_FIELDS.has(item.name),
                  );
                  return (
                    <tr key={mapping.index}>
                      <td>
                        <div className="mapping-entity">
                          <strong>{field(mapping, 'subject_label')}</strong>
                          {subjectType && <small>{subjectType}</small>}
                        </div>
                      </td>
                      <td>
                        <TermLink value={field(mapping, 'predicate_id')} prefixes={prefixes} />
                      </td>
                      <td>
                        <div className="mapping-entity">
                          <strong>{field(mapping, 'object_label')}</strong>
                          <TermLink value={field(mapping, 'object_id')} prefixes={prefixes} />
                          {objectType && <small>{objectType}</small>}
                        </div>
                      </td>
                      <td>
                        <TermLink
                          value={field(mapping, 'mapping_justification')}
                          prefixes={prefixes}
                        />
                        {rowDescriptions.map((description) => (
                          <p className="mapping-description" key={description}>
                            {description}
                          </p>
                        ))}
                        {additionalFields.length > 0 && (
                          <details className="mapping-row-details">
                            <summary>
                              {additionalFields.length} additional{' '}
                              {additionalFields.length === 1 ? 'field' : 'fields'}
                            </summary>
                            <FieldList fields={additionalFields} />
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {mappings.mappings.length === 0 && (
              <p className="curation-empty">This valid mapping set contains no records yet.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
