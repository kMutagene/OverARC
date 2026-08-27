import { useEffect, useRef, useState } from 'react';
import {
  SigmaContainer,
  useCamera,
  useLoadGraph,
  useRegisterEvents,
  useSigma,
} from '@react-sigma/core';
import { useWorkerLayoutForceAtlas2 } from '@react-sigma/layout-forceatlas2';
import { EdgeArrowProgram } from 'sigma/rendering';
import { MultiDirectedGraph } from 'graphology';

interface GraphCanvasProps {
  graph: MultiDirectedGraph;
  resetToken: number;
  selected: { kind: 'object' | 'relation'; id: string } | null;
  onSelect: (selection: { kind: 'object' | 'relation'; id: string } | null) => void;
}

function downloadPng(sigma: ReturnType<typeof useSigma>) {
  const canvases = Object.values(sigma.getCanvases());
  const source = canvases[0];
  if (!source) return;
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d');
  if (!context) return;
  context.fillStyle = '#f7faf8';
  context.fillRect(0, 0, output.width, output.height);
  canvases.forEach((canvas) => context.drawImage(canvas, 0, 0));
  const link = document.createElement('a');
  link.download = 'overarc-visible-graph.png';
  link.href = output.toDataURL('image/png');
  link.click();
}

function GraphRuntime({ graph, resetToken, selected, onSelect }: GraphCanvasProps) {
  const sigma = useSigma();
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();
  const camera = useCamera({ duration: 250 });
  const layout = useWorkerLayoutForceAtlas2({
    settings: { barnesHutOptimize: true, gravity: 1, slowDown: 5, scalingRatio: 4 },
  });
  const layoutRef = useRef(layout);
  const cameraRef = useRef(camera);
  layoutRef.current = layout;
  cameraRef.current = camera;
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);

  useEffect(() => {
    layoutRef.current.stop();
    loadGraph(graph, true);
    cameraRef.current.reset({ duration: 0 });
    setLayoutRunning(false);
    setHoveredNode(null);
    setHoveredEdge(null);
    return () => layoutRef.current.stop();
  }, [graph, loadGraph, resetToken]);

  useEffect(() => {
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
        setHoveredNode(null);
        setHoveredEdge(null);
        onSelect(null);
      },
      downNode: ({ node, event }) => {
        dragged.current = node;
        sigma.getCamera().disable();
        event.preventSigmaDefault();
      },
      moveBody: ({ event }) => {
        if (!dragged.current) return;
        const position = sigma.viewportToGraph(event);
        sigma.getGraph().mergeNodeAttributes(dragged.current, position);
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
  }, [onSelect, registerEvents, selected, sigma]);

  useEffect(() => {
    sigma.setSetting('nodeReducer', (node, data) => {
      const isSelected = selected?.kind === 'object' && selected.id === node;
      const isHovered = hoveredNode === node;
      return {
        ...data,
        label: data.isPlaceholder && !isSelected && !isHovered ? null : data.label,
        highlighted: isSelected,
        forceLabel: isSelected,
      };
    });
    sigma.setSetting('edgeReducer', (edge, data) => {
      const isSelected = selected?.kind === 'relation' && selected.id === edge;
      const isHovered = hoveredEdge === edge;
      return {
        ...data,
        label: isSelected || isHovered ? data.label : null,
        color: isSelected ? '#d14d2f' : isHovered ? '#087f73' : data.color,
        size: isSelected ? 4 : isHovered ? Math.max(data.size ?? 1, 3) : data.size,
        forceLabel: isSelected || isHovered,
        zIndex: isSelected || isHovered ? 1 : 0,
      };
    });
    sigma.refresh();
  }, [hoveredEdge, hoveredNode, selected, sigma]);

  const resetLayout = () => {
    layout.stop();
    setLayoutRunning(false);
    graph.forEachNode((node, attributes) =>
      sigma.getGraph().mergeNodeAttributes(node, { x: attributes.x, y: attributes.y }),
    );
    camera.reset();
  };

  const toggleLayout = () => {
    if (layoutRunning) layout.stop();
    else layout.start();
    setLayoutRunning(!layoutRunning);
  };

  return (
    <div className="graph-controls" aria-label="Graph controls">
      <button
        type="button"
        className="secondary"
        onClick={() => camera.zoomIn()}
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => camera.zoomOut()}
        aria-label="Zoom out"
      >
        −
      </button>
      <button type="button" className="secondary" onClick={() => camera.reset()}>
        Focus all
      </button>
      <button type="button" onClick={toggleLayout}>
        {layoutRunning ? 'Stop layout' : 'Start layout'}
      </button>
      <button type="button" className="secondary" onClick={resetLayout}>
        Reset layout
      </button>
      <button type="button" className="secondary" onClick={() => downloadPng(sigma)}>
        PNG
      </button>
    </div>
  );
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <SigmaContainer
      className="sigma-container"
      graph={MultiDirectedGraph}
      settings={{
        allowInvalidContainer: true,
        defaultEdgeType: 'arrow',
        edgeProgramClasses: { arrow: EdgeArrowProgram },
        enableEdgeEvents: true,
        edgeLabelColor: { color: '#173c3a' },
        edgeLabelSize: 12,
        edgeLabelWeight: '600',
        labelDensity: 0.35,
        labelRenderedSizeThreshold: 10,
        minEdgeThickness: 2.5,
        renderEdgeLabels: true,
        hideEdgesOnMove: true,
        hideLabelsOnMove: true,
        zIndex: true,
      }}
    >
      <GraphRuntime {...props} />
    </SigmaContainer>
  );
}
