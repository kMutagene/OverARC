import { useCallback, useEffect, useState } from 'react';
import { api } from '../../shared/api';
import type { ElementDetail, Projection, Selection } from '../../shared/types';
import { projectedDetail } from './detailModel';

export function useElementSelection(activeState: string | null, projection: Projection | null) {
  const [selected, setSelected] = useState<Selection | null>(null);
  const [detail, setDetail] = useState<ElementDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(null);
    setDetail(null);
    setError(null);
  }, [activeState]);

  useEffect(() => {
    if (!activeState || !selected) {
      setDetail(null);
      setLoading(false);
      return;
    }

    const local = projectedDetail(projection, selected);
    if (local) {
      setError(null);
      setDetail(local);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void api
      .details(activeState, selected.kind, selected.id)
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
  }, [activeState, projection, selected]);

  const select = useCallback((selection: Selection | null) => {
    setError(null);
    setSelected(selection);
  }, []);

  return { selected, detail, loading, error, select, clear: () => select(null) };
}
