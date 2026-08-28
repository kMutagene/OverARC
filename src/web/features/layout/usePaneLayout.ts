import { useCallback, useEffect, useRef, useState } from 'react';

const LEFT_PANE_DEFAULT = 278;
const RIGHT_PANE_DEFAULT = 345;
const PANE_COLLAPSE_THRESHOLD = 170;
const PANE_EXPANDED_MINIMUM = 220;
const GRAPH_MINIMUM = 420;
const RESIZER_TOTAL = 14;

/** Reads a persisted pane width and ignores missing, negative, or malformed values. */
function storedPaneWidth(key: string, fallback: number): number {
  const value = Number.parseFloat(window.localStorage.getItem(key) ?? '');
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Snaps sub-threshold widths closed and clamps expanded widths to the available workbench. */
function snapPaneWidth(value: number, maximum: number): number {
  if (value < PANE_COLLAPSE_THRESHOLD) return 0;
  return Math.min(Math.max(value, PANE_EXPANDED_MINIMUM), maximum);
}

/** Owns persisted left/right pane geometry and exposes pointer, keyboard, and toggle commands. */
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

  // Persist the left width and retain the last expanded value for restoration.
  useEffect(() => {
    window.localStorage.setItem('overarc.leftPaneWidth', String(leftWidth));
    if (leftWidth > 0) lastLeftWidth.current = leftWidth;
  }, [leftWidth]);

  // Persist the right width and retain the last expanded value for restoration.
  useEffect(() => {
    window.localStorage.setItem('overarc.rightPaneWidth', String(rightWidth));
    if (rightWidth > 0) lastRightWidth.current = rightWidth;
  }, [rightWidth]);

  /** Preserves the center graph minimum while calculating one pane's current maximum width. */
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
      /** Converts an absolute pointer position into a snapped left-pane width. */
      onResize: (clientX: number) => {
        const bounds = workbenchRef.current?.getBoundingClientRect();
        if (bounds) setLeftWidth(snapPaneWidth(clientX - bounds.left, leftMaximum));
      },
      /** Applies a keyboard-sized delta to the left pane within current bounds. */
      onResizeBy: (delta: number) =>
        setLeftWidth((width) =>
          snapPaneWidth((width || PANE_EXPANDED_MINIMUM) + delta, paneMaximum(rightWidth)),
        ),
      /** Completely collapses the left pane. */
      onCollapse: () => setLeftWidth(0),
      /** Toggles the left pane between collapsed and its most recent expanded width. */
      onToggle: () => setLeftWidth((width) => (width === 0 ? lastLeftWidth.current : 0)),
    },
    right: {
      width: rightWidth,
      maxWidth: rightMaximum,
      /** Converts an absolute pointer position into a snapped right-pane width. */
      onResize: (clientX: number) => {
        const bounds = workbenchRef.current?.getBoundingClientRect();
        if (bounds) setRightWidth(snapPaneWidth(bounds.right - clientX, rightMaximum));
      },
      /** Applies a keyboard-sized delta to the right pane within current bounds. */
      onResizeBy: (delta: number) =>
        setRightWidth((width) =>
          snapPaneWidth((width || PANE_EXPANDED_MINIMUM) + delta, paneMaximum(leftWidth)),
        ),
      /** Completely collapses the right pane. */
      onCollapse: () => setRightWidth(0),
      /** Toggles the right pane between collapsed and its most recent expanded width. */
      onToggle: () => setRightWidth((width) => (width === 0 ? lastRightWidth.current : 0)),
    },
  };
}
