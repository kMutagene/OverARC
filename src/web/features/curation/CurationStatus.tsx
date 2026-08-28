import type { CurationDraft, StateSummary } from '../../shared/types';

/** Shows native editability, the named draft process, and explicit save/discard actions. */
export function CurationStatus({
  state,
  draft,
  notice,
  error,
  busy,
  onSave,
  onDiscard,
  onDismissNotice,
}: {
  state: StateSummary | null;
  draft: CurationDraft | null;
  notice: string | null;
  error: string | null;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onDismissNotice: () => void;
}) {
  return (
    <section className="curation-status" aria-label="Curation status">
      <h2>Curation</h2>
      <p>
        {state?.editable
          ? 'This native state supports selected literal mapping.'
          : 'This state is browseable but read-only.'}
      </p>
      {draft && (
        <div className="draft-status">
          <span className="eyebrow">Unsaved process</span>
          <strong>{draft.processName}</strong>
          <small>
            Revision {draft.revision} · {draft.operations.length} operations
          </small>
          <div>
            <button
              type="button"
              className="compact"
              disabled={busy || draft.operations.length === 0}
              onClick={onSave}
            >
              Save
            </button>
            <button type="button" className="outline compact" disabled={busy} onClick={onDiscard}>
              Discard
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="curation-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <div className="curation-notice" role="status">
          <p>{notice}</p>
          <button type="button" className="outline compact" onClick={onDismissNotice}>
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
