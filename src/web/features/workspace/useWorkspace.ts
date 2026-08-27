import { useCallback, useEffect, useState } from 'react';
import { api } from '../../shared/api';
import type { Projection, Workspace } from '../../shared/types';

function updateUrl(stateId: string) {
  window.history.replaceState(null, '', `?state=${encodeURIComponent(stateId)}`);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeState, setActiveState] = useState<string | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetToken, setResetToken] = useState(0);

  const loadWorkspace = useCallback(async (refresh = false) => {
    setError(null);
    try {
      const next = refresh ? await api.refresh() : await api.workspace();
      setWorkspace(next);
      const valid = new Set(
        next.states.filter((state) => state.status === 'valid').map((state) => state.id),
      );
      const requested = new URLSearchParams(window.location.search).get('state');
      setActiveState((current) => {
        const chosen =
          (current && valid.has(current) ? current : null) ??
          (requested && valid.has(requested) ? requested : null) ??
          next.defaultStateId;
        if (chosen) updateUrl(chosen);
        return chosen;
      });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!activeState) {
      setProjection(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResetToken((value) => value + 1);
    performance.mark('overarc-projection-start');
    void api
      .projection(activeState)
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
  }, [activeState]);

  return {
    workspace,
    activeState,
    projection,
    error,
    loading,
    resetToken,
    chooseState: (id: string) => {
      setActiveState(id);
      updateUrl(id);
    },
    refresh: () => loadWorkspace(true),
  };
}
