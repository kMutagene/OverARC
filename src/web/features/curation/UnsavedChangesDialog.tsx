import { useEffect, useRef } from 'react';
import type { CurationDraft } from '../../shared/types';
import type { StateSwitchDecision } from '../workspace/useWorkspace';

/** Modal Save/Discard/Stay guard for an explicit state switch with dirty draft work. */
export function UnsavedChangesDialog({
  draft,
  busy,
  onDecision,
}: {
  draft: CurationDraft;
  busy: boolean;
  onDecision: (decision: StateSwitchDecision) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const activeDialog = dialog.current;
    activeDialog?.showModal();
    return () => {
      if (activeDialog?.open) activeDialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="curation-dialog unsaved-dialog"
      aria-labelledby="unsaved-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onDecision('stay');
      }}
    >
      <h2 id="unsaved-dialog-title">Unsaved curation changes</h2>
      <p>
        {draft.processName} contains {draft.operations.length} unsaved operations. Choose what to do
        before switching states.
      </p>
      <footer>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => onDecision('stay')}
        >
          Stay
        </button>
        <button
          type="button"
          className="outline"
          disabled={busy}
          onClick={() => onDecision('discard')}
        >
          Discard
        </button>
        <button type="button" disabled={busy} onClick={() => onDecision('save')}>
          {busy ? 'Working…' : 'Save'}
        </button>
      </footer>
    </dialog>
  );
}
