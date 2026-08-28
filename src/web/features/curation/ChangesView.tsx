import type { CurationDraft } from '../../shared/types';

/** Shows the current draft's ordered typed commands and provides replay-based undo. */
export function ChangesView({
  draft,
  active,
  disabled,
  onUndo,
}: {
  draft: CurationDraft | null;
  active: boolean;
  disabled: boolean;
  onUndo: (operationId: string) => void;
}) {
  return (
    <section
      className={`center-view changes-view${active ? ' active' : ' inactive'}`}
      aria-label="Draft changes"
      aria-hidden={!active}
      inert={!active}
    >
      <header className="changes-header">
        <span className="eyebrow">Unsaved curation process</span>
        <h2>{draft?.processName ?? 'No active draft'}</h2>
        {draft && (
          <p>
            Revision {draft.revision} · curator {draft.curator} · {draft.operations.length}{' '}
            operations
          </p>
        )}
      </header>
      {!draft || draft.operations.length === 0 ? (
        <div className="curation-empty">No unsaved operations.</div>
      ) : (
        <ol className="changes-list">
          {draft.operations.map((operation) => (
            <li key={operation.id}>
              <article>
                <header>
                  <div>
                    <strong>{operation.literal}</strong>
                    <span>
                      {operation.predicateId} → {operation.targetTermLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="outline compact"
                    disabled={disabled}
                    onClick={() => onUndo(operation.id)}
                  >
                    Undo
                  </button>
                </header>
                <dl>
                  <dt>Source selector</dt>
                  <dd>
                    <code>{operation.selector}</code>
                  </dd>
                  <dt>Output selector</dt>
                  <dd>
                    <code>{operation.outputSelector}</code>
                  </dd>
                  <dt>Target IRI</dt>
                  <dd>
                    <code>{operation.targetTermId}</code>
                  </dd>
                  <dt>SSSOM record</dt>
                  <dd>
                    <code>{operation.mappingRecord.recordId}</code>{' '}
                    <small>{operation.mappingCreated ? 'created' : 'reused'}</small>
                  </dd>
                </dl>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
