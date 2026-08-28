import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterEvents, useSigma } from '@react-sigma/core';
import type { Selection } from '../../shared/types';

/** Registers selection, hover, stage-clear, and bounded node-drag behavior against the active Sigma instance. */
export function useSigmaInteractions(
  selected: Selection | null,
  onSelect: (selection: Selection | null) => void,
) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);

  /** Clears reducer-driving hover state for both graph element kinds. */
  const clearHover = useCallback(() => {
    setHoveredNode(null);
    setHoveredEdge(null);
  }, []);

  // Register one complete event map so every drag termination path shares the same cleanup.
  useEffect(() => {
    /** Ends every drag path and always restores camera controls. */
    const endDrag = () => {
      dragged.current = null;
      sigma.getCamera().enable();
    };

    registerEvents({
      clickNode: ({ node }) =>
        onSelect(
          selected?.kind === 'object' && selected.id === node ? null : { kind: 'object', id: node },
        ),
      enterNode: ({ node }) => setHoveredNode(node),
      leaveNode: () => setHoveredNode(null),
      clickEdge: ({ edge }) =>
        onSelect(
          selected?.kind === 'relation' && selected.id === edge
            ? null
            : { kind: 'relation', id: edge },
        ),
      enterEdge: ({ edge }) => {
        setHoveredEdge(edge);
        sigma.getContainer().style.cursor = 'pointer';
      },
      leaveEdge: () => {
        setHoveredEdge(null);
        sigma.getContainer().style.cursor = '';
      },
      clickStage: () => {
        clearHover();
        onSelect(null);
      },
      downNode: ({ node, event }) => {
        dragged.current = node;
        sigma.getCamera().disable();
        event.preventSigmaDefault();
      },
      moveBody: ({ event }) => {
        if (!dragged.current) return;
        sigma.getGraph().mergeNodeAttributes(dragged.current, sigma.viewportToGraph(event));
        event.preventSigmaDefault();
      },
      upNode: endDrag,
      upEdge: endDrag,
      upStage: endDrag,
      leaveStage: endDrag,
      mouseup: endDrag,
      mouseleave: endDrag,
    });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('blur', endDrag);
    return () => {
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('blur', endDrag);
      sigma.getContainer().style.cursor = '';
      endDrag();
    };
  }, [clearHover, onSelect, registerEvents, selected, sigma]);

  return { hoveredNode, hoveredEdge, clearHover };
}
