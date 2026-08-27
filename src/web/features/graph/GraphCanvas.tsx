import { useEffect, useRef, useState } from 'react';
import { SigmaContainer, useCamera, useLoadGraph, useSigma } from '@react-sigma/core';
import { useWorkerLayoutForceAtlas2 } from '@react-sigma/layout-forceatlas2';
import { EdgeCurvedArrowProgram } from '@sigma/edge-curve';
import { EdgeArrowProgram } from 'sigma/rendering';
import { MultiDirectedGraph } from 'graphology';
import type { Selection, Theme } from '../../shared/types';
import { GraphControls } from './GraphControls';
import { downloadGraphPng, GRAPH_THEME, HOVER_RENDERERS } from './sigmaTheme';
import { useSigmaInteractions } from './useSigmaInteractions';

interface GraphCanvasProps {
  graph: MultiDirectedGraph;
  resetToken: number;
  theme: Theme;
  selected: Selection | null;
  onSelect: (selection: Selection | null) => void;
}

function GraphRuntime({ graph, resetToken, theme, selected, onSelect }: GraphCanvasProps) {
  const sigma = useSigma();
  const loadGraph = useLoadGraph();
  const camera = useCamera({ duration: 250 });
  const layout = useWorkerLayoutForceAtlas2({
    settings: { barnesHutOptimize: true, gravity: 1, slowDown: 5, scalingRatio: 4 },
  });
  const layoutRef = useRef(layout);
  const cameraRef = useRef(camera);
  layoutRef.current = layout;
  cameraRef.current = camera;
  const [layoutRunning, setLayoutRunning] = useState(false);
  const { hoveredNode, hoveredEdge, clearHover } = useSigmaInteractions(selected, onSelect);

  useEffect(() => {
    layoutRef.current.stop();
    loadGraph(graph, true);
    cameraRef.current.reset({ duration: 0 });
    setLayoutRunning(false);
    clearHover();
    return () => layoutRef.current.stop();
  }, [clearHover, graph, loadGraph, resetToken]);

  useEffect(() => {
    const palette = GRAPH_THEME[theme];
    sigma.setSetting('labelColor', { color: palette.label });
    sigma.setSetting('edgeLabelColor', { color: palette.label });
    sigma.setSetting('defaultDrawNodeHover', HOVER_RENDERERS[theme]);
    sigma.setSetting('nodeReducer', (node, data) => {
      const isSelected = selected?.kind === 'object' && selected.id === node;
      const isHovered = hoveredNode === node;
      return {
        ...data,
        color: theme === 'dark' ? data.darkColor : data.color,
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
        color: isSelected
          ? palette.selected
          : isHovered
            ? palette.hover
            : theme === 'dark'
              ? data.darkColor
              : data.color,
        size: isSelected ? 4 : isHovered ? Math.max(data.size ?? 1, 3) : data.size,
        forceLabel: isSelected || isHovered,
        zIndex: isSelected || isHovered ? 1 : 0,
      };
    });
    sigma.refresh();
  }, [hoveredEdge, hoveredNode, selected, sigma, theme]);

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
    <GraphControls
      layoutRunning={layoutRunning}
      onZoomIn={() => camera.zoomIn()}
      onZoomOut={() => camera.zoomOut()}
      onFocusAll={() => camera.reset()}
      onToggleLayout={toggleLayout}
      onResetLayout={resetLayout}
      onExportPng={() => downloadGraphPng(sigma, theme)}
    />
  );
}

export function GraphCanvas(props: GraphCanvasProps) {
  const palette = GRAPH_THEME[props.theme];
  return (
    <SigmaContainer
      className="sigma-container"
      graph={MultiDirectedGraph}
      settings={{
        allowInvalidContainer: true,
        defaultEdgeType: 'arrow',
        edgeProgramClasses: { arrow: EdgeArrowProgram, curved: EdgeCurvedArrowProgram },
        enableEdgeEvents: true,
        defaultDrawNodeHover: HOVER_RENDERERS[props.theme],
        labelColor: { color: palette.label },
        edgeLabelColor: { color: palette.label },
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
