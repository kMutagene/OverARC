import { useCallback, useEffect, useRef, useState } from 'react';

const LEFT_PANE_DEFAULT = 278;
const RIGHT_PANE_DEFAULT = 345;
const PANE_COLLAPSE_THRESHOLD = 170;
const PANE_EXPANDED_MINIMUM = 220;
const GRAPH_MINIMUM = 420;
const RESIZER_TOTAL = 14;

function storedPaneWidth(key: string, fallback: number): number {
  const value = Number.parseFloat(window.localStorage.getItem(key) ?? '');
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function snapPaneWidth(value: number, maximum: number): number {
  if (value < PANE_COLLAPSE_THRESHOLD) return 0;
  return Math.min(Math.max(value, PANE_EXPANDED_MINIMUM), maximum);
}

export function usePaneLayout() {
  const workbenchRef = useRef<HTMLElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(() =>
    storedPaneWidth('overarc.leftPaneWidth', LEFT_PANE_DEFAULT),
  );
  const [rightWidth, setRightWidth] = useState(() =>
    storedPaneWidth('overarc.rightPaneWidth', RIGHT_PANE_DEFAULT),
  );
  const lastLeftWidth = useRef(leftWidth || LEFT_PANE_DEFAULT);
  const lastRightWidth = useRef(rightWidth || RIGHT_PANE_DEFAULT);

  useEffect(() => {
    window.localStorage.setItem('overarc.leftPaneWidth', String(leftWidth));
    if (leftWidth > 0) lastLeftWidth.current = leftWidth;
  }, [leftWidth]);

  useEffect(() => {
    window.localStorage.setItem('overarc.rightPaneWidth', String(rightWidth));
    if (rightWidth > 0) lastRightWidth.current = rightWidth;
  }, [rightWidth]);

  const paneMaximum = useCallback((otherWidth: number) => {
    const available =
      (workbenchRef.current?.getBoundingClientRect().width ?? window.innerWidth) -
      otherWidth -
      GRAPH_MINIMUM -
      RESIZER_TOTAL;
    return Math.max(PANE_EXPANDED_MINIMUM, available);
  }, []);

  const leftMaximum = paneMaximum(rightWidth);
  const rightMaximum = paneMaximum(leftWidth);

  return {
    workbenchRef,
    left: {
      width: leftWidth,
      maxWidth: leftMaximum,
      onResize: (clientX: number) => {
        const bounds = workbenchRef.current?.getBoundingClientRect();
        if (bounds) setLeftWidth(snapPaneWidth(clientX - bounds.left, leftMaximum));
      },
      onResizeBy: (delta: number) =>
        setLeftWidth((width) =>
          snapPaneWidth((width || PANE_EXPANDED_MINIMUM) + delta, paneMaximum(rightWidth)),
        ),
      onCollapse: () => setLeftWidth(0),
      onToggle: () => setLeftWidth((width) => (width === 0 ? lastLeftWidth.current : 0)),
    },
    right: {
      width: rightWidth,
      maxWidth: rightMaximum,
      onResize: (clientX: number) => {
        const bounds = workbenchRef.current?.getBoundingClientRect();
        if (bounds) setRightWidth(snapPaneWidth(bounds.right - clientX, rightMaximum));
      },
      onResizeBy: (delta: number) =>
        setRightWidth((width) =>
          snapPaneWidth((width || PANE_EXPANDED_MINIMUM) + delta, paneMaximum(leftWidth)),
        ),
      onCollapse: () => setRightWidth(0),
      onToggle: () => setRightWidth((width) => (width === 0 ? lastRightWidth.current : 0)),
    },
  };
}
