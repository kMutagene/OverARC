import { useCallback, useEffect, useState } from 'react';
import { api } from '../../shared/api';
import type { ElementDetail, Projection, Selection, TermDetail } from '../../shared/types';
import { projectedDetail } from './detailModel';

/** Owns exact state-bound selection and resolves graph or term details through the appropriate path. */
export function useElementSelection(
  activeState: string | null,
  projection: Projection | null,
  draftId: string | null = null,
) {
  const [selected, setSelected] = useState<Selection | null>(null);
  const [detail, setDetail] = useState<ElementDetail | null>(null);
  const [termDetail, setTermDetail] = useState<TermDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State switches intentionally clear non-bookmark selection and any previous detail error.
  useEffect(() => {
    setSelected(null);
    setDetail(null);
    setTermDetail(null);
    setError(null);
  }, [activeState]);

  // Projection-only graph elements resolve synchronously; canonical graph and term details use separate APIs.
  useEffect(() => {
    if (!activeState || !selected) {
      setDetail(null);
      setTermDetail(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setTermDetail(null);

    if (selected.kind === 'term') {
      const load = draftId
        ? api.draftTermDetails(draftId, selected.id)
        : api.termDetails(activeState, selected.id);
      void load
        .then((next) => {
          if (!cancelled) setTermDetail(next);
        })
        .catch((reason) => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    const local = projectedDetail(projection, selected);
    if (local) {
      setError(null);
      setDetail(local);
      setLoading(false);
      return;
    }

    const load = draftId
      ? api.draftDetails(draftId, selected.kind, selected.id)
      : api.details(activeState, selected.kind, selected.id);
    void load
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeState, draftId, projection, selected]);

  /** Replaces or clears selection while discarding any error from the previous element. */
  const select = useCallback((selection: Selection | null) => {
    setError(null);
    setSelected(selection);
  }, []);

  return {
    selected,
    detail,
    termDetail,
    loading,
    error,
    select,
    /** Clears graph or term selection through the same error-resetting path. */
    clear: () => select(null),
  };
}
