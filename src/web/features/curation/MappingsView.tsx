import type { Mappings, SssomField, SssomMapping } from '../../shared/types';

/** Returns populated lexical values for one exact SSSOM slot name. */
function field(mapping: SssomMapping, name: string): string {
  return mapping.fields.find((candidate) => candidate.name === name)?.values.join(' | ') ?? '—';
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
                  <th scope="col">Target</th>
                  <th scope="col">Justification</th>
                  <th scope="col">Record</th>
                  <th scope="col">All populated fields</th>
                </tr>
              </thead>
              <tbody>
                {mappings.mappings.map((mapping) => (
                  <tr key={mapping.index}>
                    <td>{field(mapping, 'subject_label')}</td>
                    <td>{field(mapping, 'predicate_id')}</td>
                    <td>
                      <strong>{field(mapping, 'object_label')}</strong>
                      <br />
                      <code>{field(mapping, 'object_id')}</code>
                    </td>
                    <td>{field(mapping, 'mapping_justification')}</td>
                    <td>
                      <code>{field(mapping, 'record_id')}</code>
                    </td>
                    <td>
                      <details>
                        <summary>{mapping.fields.length} fields</summary>
                        <FieldList fields={mapping.fields} />
                      </details>
                    </td>
                  </tr>
                ))}
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
