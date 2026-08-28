import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiProblem } from '../../shared/api';
import type {
  CurationDraft,
  CurationSave,
  LiteralOccurrence,
  Mappings,
  Projection,
  Workspace,
} from '../../shared/types';

const DRAFT_SESSION_KEY = 'overarc.draftId';

/** Curator choice when a requested state switch would leave unsaved operations. */
export type StateSwitchDecision = 'save' | 'discard' | 'stay';

/** Replaces the URL query with the exact active state ID and no transient view state. */
function updateUrl(stateId: string) {
  window.history.replaceState(null, '', `?state=${encodeURIComponent(stateId)}`);
}

/** Normalizes arbitrary rejected values into a user-facing error string. */
function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** Loads immutable or replayed workspace views and owns the complete server-draft lifecycle. */
export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeState, setActiveState] = useState<string | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [mappings, setMappings] = useState<Mappings | null>(null);
  const [draft, setDraft] = useState<CurationDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [curationError, setCurationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [pendingState, setPendingState] = useState<string | null>(null);
  const activeStateRef = useRef<string | null>(null);
  const draftRef = useRef<CurationDraft | null>(null);
  const initialized = useRef(false);

  /** Replaces draft state and keeps session storage limited to the server-issued draft ID. */
  const updateDraft = useCallback((next: CurationDraft | null) => {
    draftRef.current = next;
    setDraft(next);
    if (next) window.sessionStorage.setItem(DRAFT_SESSION_KEY, next.id);
    else window.sessionStorage.removeItem(DRAFT_SESSION_KEY);
  }, []);

  /** Selects a validated state and mirrors only its exact ID into the URL. */
  const activateState = useCallback((id: string) => {
    activeStateRef.current = id;
    setActiveState(id);
    updateUrl(id);
  }, []);

  /** Loads metadata, optionally reattaches a stored draft, and returns the refreshed catalog. */
  const loadWorkspace = useCallback(
    async (refresh = false, reattach = false, preferredState: string | null = null) => {
      setError(null);
      try {
        const next = refresh ? await api.refresh() : await api.workspace();
        setWorkspace(next);
        const valid = new Set(
          next.states.filter((state) => state.status === 'valid').map((state) => state.id),
        );
        let attached = draftRef.current;
        if (reattach) {
          const storedId = window.sessionStorage.getItem(DRAFT_SESSION_KEY);
          if (storedId) {
            try {
              attached = await api.draft(storedId);
              updateDraft(attached);
              setNotice(`Reattached unsaved process ${attached.processName}.`);
            } catch (reason) {
              updateDraft(null);
              attached = null;
              setNotice(
                reason instanceof ApiProblem && reason.status === 409
                  ? 'The previous draft no longer matches the current workspace and was detached.'
                  : 'The previous server draft expired or was lost and was removed from this browser session.',
              );
            }
          }
        }

        const requested = new URLSearchParams(window.location.search).get('state');
        const chosen =
          (preferredState && valid.has(preferredState) ? preferredState : null) ??
          (attached && valid.has(attached.stateId) ? attached.stateId : null) ??
          (activeStateRef.current && valid.has(activeStateRef.current)
            ? activeStateRef.current
            : null) ??
          (requested && valid.has(requested) ? requested : null) ??
          next.defaultStateId;
        if (chosen) activateState(chosen);
        else {
          activeStateRef.current = null;
          setActiveState(null);
        }
        return next;
      } catch (reason) {
        setError(errorMessage(reason));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [activateState, updateDraft],
  );

  // Load metadata once and reattach solely from the server-issued ID retained for this tab.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void loadWorkspace(false, true);
  }, [loadWorkspace]);

  // Active state switches reset graph layout; draft replay updates do not reset camera or layout state.
  useEffect(() => {
    if (activeState) setResetToken((value) => value + 1);
  }, [activeState]);

  // Load every exploration view from replayed ArcIR whenever an active draft revision changes.
  useEffect(() => {
    if (!activeState) {
      setProjection(null);
      return;
    }
    let cancelled = false;
    const activeDraft = draft?.stateId === activeState ? draft : null;
    setLoading(true);
    setError(null);
    performance.mark('overarc-projection-start');
    const load = activeDraft ? api.draftProjection(activeDraft.id) : api.projection(activeState);
    void load
      .then((next) => {
        if (cancelled) return;
        setProjection(next);
        performance.mark('overarc-projection-end');
        performance.measure(
          'overarc-projection',
          'overarc-projection-start',
          'overarc-projection-end',
        );
      })
      .catch((reason) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeState, draft]);

  // Mapping views follow the same immutable or draft source without blocking Graph/Table/Terms.
  useEffect(() => {
    if (!activeState) {
      setMappings(null);
      setCurationError(null);
      return;
    }
    const activeDraft = draft?.stateId === activeState ? draft : null;
    const editable = workspace?.states.find((state) => state.id === activeState)?.editable === true;
    if (!activeDraft && !editable) {
      setMappings(null);
      setCurationError(null);
      return;
    }
    let cancelled = false;
    setCurationError(null);
    const load = activeDraft ? api.draftMappings(activeDraft.id) : api.mappings(activeState);
    void load
      .then((next) => {
        if (!cancelled) setMappings(next);
      })
      .catch((reason) => {
        if (!cancelled) setCurationError(errorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [activeState, draft, workspace]);

  // Browser-level navigation retains the platform's Leave/Stay safety prompt for dirty drafts.
  useEffect(() => {
    if (!draft || draft.operations.length === 0) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [draft]);

  /** Clears a draft that the server reports as expired or unknown and explains the loss once. */
  const handleLostDraft = useCallback(
    (reason: unknown) => {
      if (!(reason instanceof ApiProblem) || reason.status !== 404) return false;
      updateDraft(null);
      setNotice('The server draft expired or was lost. Its browser reference has been removed.');
      return true;
    },
    [updateDraft],
  );

  /** Creates a draft when needed and appends one typed occurrence mapping at its exact revision. */
  const addLiteralMapping = useCallback(
    async (
      occurrence: LiteralOccurrence,
      targetTermId: string,
      predicateId: string,
      curator: string,
    ) => {
      if (!activeStateRef.current) return null;
      setMutating(true);
      setCurationError(null);
      try {
        let current = draftRef.current;
        if (!current) {
          current = await api.createDraft(activeStateRef.current, curator);
          updateDraft(current);
        }
        const next = await api.addLiteralMapping(current.id, {
          expectedRevision: current.revision,
          selector: occurrence.selector,
          literal: occurrence.literal,
          targetTermId,
          predicateId,
        });
        updateDraft(next);
        setNotice(null);
        return next;
      } catch (reason) {
        handleLostDraft(reason);
        setCurationError(errorMessage(reason));
        return null;
      } finally {
        setMutating(false);
      }
    },
    [handleLostDraft, updateDraft],
  );

  /** Removes one command and replaces all draft projections with the server replay result. */
  const undoOperation = useCallback(
    async (operationId: string) => {
      const current = draftRef.current;
      if (!current) return null;
      setMutating(true);
      setCurationError(null);
      try {
        const next = await api.undoOperation(current.id, operationId, current.revision);
        updateDraft(next);
        return next;
      } catch (reason) {
        handleLostDraft(reason);
        setCurationError(errorMessage(reason));
        return null;
      } finally {
        setMutating(false);
      }
    },
    [handleLostDraft, updateDraft],
  );

  /** Discards the current server draft without changing any workspace artifact. */
  const discardDraft = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return true;
    setMutating(true);
    setCurationError(null);
    try {
      await api.discardDraft(current.id, current.revision);
      updateDraft(null);
      setNotice('Draft discarded. No workspace artifact was changed.');
      return true;
    } catch (reason) {
      if (!handleLostDraft(reason)) setCurationError(errorMessage(reason));
      return false;
    } finally {
      setMutating(false);
    }
  }, [handleLostDraft, updateDraft]);

  /** Atomically saves the current non-empty draft and refreshes native state selection. */
  const saveDraft = useCallback(
    async (preferredState: string | null = null): Promise<CurationSave | null> => {
      const current = draftRef.current;
      if (!current) return null;
      setMutating(true);
      setCurationError(null);
      try {
        const saved = await api.saveDraft(current.id, current.revision);
        updateDraft(null);
        await loadWorkspace(true, false, preferredState ?? saved.successorStateId);
        setNotice(`Saved ${saved.processName}; immutable successors are now selected.`);
        return saved;
      } catch (reason) {
        handleLostDraft(reason);
        setCurationError(errorMessage(reason));
        return null;
      } finally {
        setMutating(false);
      }
    },
    [handleLostDraft, loadWorkspace, updateDraft],
  );

  /** Requests a state switch or opens the explicit Save/Discard/Stay decision for dirty work. */
  const chooseState = useCallback(
    (id: string) => {
      if (id === activeStateRef.current) return;
      const current = draftRef.current;
      if (current && current.operations.length > 0) {
        setPendingState(id);
        return;
      }
      if (current) {
        void discardDraft().then((discarded) => {
          if (discarded) activateState(id);
        });
      } else activateState(id);
    },
    [activateState, discardDraft],
  );

  /** Applies the curator's explicit dirty-state decision without silently losing commands. */
  const resolveStateSwitch = useCallback(
    async (decision: StateSwitchDecision) => {
      const target = pendingState;
      if (!target || decision === 'stay') {
        setPendingState(null);
        return;
      }
      if (decision === 'discard') {
        if (await discardDraft()) activateState(target);
      } else {
        await saveDraft(target);
      }
      setPendingState(null);
    },
    [activateState, discardDraft, pendingState, saveDraft],
  );

  const activeSummary = workspace?.states.find((state) => state.id === activeState) ?? null;
  return {
    workspace,
    activeState,
    activeSummary,
    projection,
    mappings,
    draft,
    error,
    curationError,
    notice,
    loading,
    mutating,
    resetToken,
    pendingState,
    chooseState,
    resolveStateSwitch,
    addLiteralMapping,
    undoOperation,
    discardDraft,
    saveDraft,
    clearCurationError: () => setCurationError(null),
    clearNotice: () => setNotice(null),
    /** Requests a read-only revalidation while preserving a still-valid state or draft selection. */
    refresh: () => loadWorkspace(true),
  };
}
