import type { CurationDraft, StateSummary } from '../../shared/types';

/** Shows browse/curation mode, native editability, and explicit draft save/discard actions. */
export function CurationStatus({
  state,
  draft,
  notice,
  error,
  busy,
  curationMode,
  onSave,
  onDiscard,
  onDismissNotice,
  onToggleMode,
}: {
  state: StateSummary | null;
  draft: CurationDraft | null;
  notice: string | null;
  error: string | null;
  busy: boolean;
  curationMode: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onDismissNotice: () => void;
  onToggleMode: () => void;
}) {
  return (
    <section className="curation-status" aria-label="Curation status">
      <h2>Curation</h2>
      <p>
        {state?.editable
          ? curationMode
            ? 'Curation mode is active. Editing controls are available in the inspector.'
            : 'Browse mode is active. Enter curation mode to show editing controls.'
          : 'This state is browseable but read-only.'}
      </p>
      {state?.editable && (
        <button
          type="button"
          className={
            curationMode ? 'outline compact curation-mode-toggle' : 'compact curation-mode-toggle'
          }
          aria-pressed={curationMode}
          disabled={busy}
          onClick={onToggleMode}
        >
          {curationMode ? 'Exit curation mode' : 'Enter curation mode'}
        </button>
      )}
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
