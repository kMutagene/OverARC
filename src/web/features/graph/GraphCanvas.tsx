import { useEffect, useRef, useState } from 'react';
import { SigmaContainer, useCamera, useLoadGraph, useSigma } from '@react-sigma/core';
import { useWorkerLayoutForceAtlas2 } from '@react-sigma/layout-forceatlas2';
import { EdgeCurvedArrowProgram } from '@sigma/edge-curve';
import { EdgeArrowProgram } from 'sigma/rendering';
import { MultiDirectedGraph } from 'graphology';
import type { Selection, Theme, VisibleProjection } from '../../shared/types';
import { nodeViewStyle, relationViewStyle, visibleGraphBounds } from './graphModel';
import { GraphControls } from './GraphControls';
import { downloadGraphPng, GRAPH_THEME, HOVER_RENDERERS } from './sigmaTheme';
import { useSigmaInteractions } from './useSigmaInteractions';

/** Inputs required to render and interact with one state-wide graph. */
interface GraphCanvasProps {
  graph: MultiDirectedGraph;
  visible: VisibleProjection;
  resetToken: number;
  theme: Theme;
  active: boolean;
  selected: Selection | null;
  onSelect: (selection: Selection | null) => void;
}

/** Runs inside Sigma context to synchronize graph data, reducers, layout, camera, and controls. */
function GraphRuntime({
  graph,
  visible,
  resetToken,
  theme,
  active,
  selected,
  onSelect,
}: GraphCanvasProps) {
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
  const [labelsVisible, setLabelsVisible] = useState(false);
  const { hoveredEdge, clearHover } = useSigmaInteractions(selected, onSelect);

  // A new state/reset token is the only lifecycle event that reloads coordinates and camera.
  useEffect(() => {
    layoutRef.current.stop();
    loadGraph(graph, true);
    sigma.setCustomBBox(null);
    cameraRef.current.reset({ duration: 0 });
    setLayoutRunning(false);
    clearHover();
    return () => layoutRef.current.stop();
  }, [clearHover, graph, loadGraph, resetToken, sigma]);

  // Hidden Sigma stays mounted; stop its worker and resize it when made visible again.
  useEffect(() => {
    if (!active) {
      layoutRef.current.stop();
      setLayoutRunning(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      sigma.resize(true);
      sigma.refresh();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, sigma]);

  // Reducers apply theme, filters, hover, and selection without rebuilding graph identity.
  useEffect(() => {
    const palette = GRAPH_THEME[theme];
    sigma.setSetting('labelColor', { color: palette.label });
    sigma.setSetting('edgeLabelColor', { color: palette.label });
    sigma.setSetting('defaultDrawNodeHover', HOVER_RENDERERS[theme]);
    sigma.setSetting('nodeReducer', (node, data) => {
      const isSelected = selected?.kind === 'object' && selected.id === node;
      const style = nodeViewStyle(
        typeof data.kind === 'string' ? data.kind : null,
        Boolean(data.isPlaceholder),
        visible.nodeStatus.get(node),
        theme,
      );
      return {
        ...data,
        ...style,
        label: style.hidden || !labelsVisible ? null : data.label,
        highlighted: isSelected,
        forceLabel: labelsVisible,
      };
    });
    sigma.setSetting('edgeReducer', (edge, data) => {
      const isSelected = selected?.kind === 'relation' && selected.id === edge;
      const isHovered = hoveredEdge === edge;
      const style = relationViewStyle(
        Boolean(data.isDerived),
        visible.relationStatus.get(edge),
        theme,
      );
      return {
        ...data,
        ...style,
        label: !style.hidden && labelsVisible ? data.label : null,
        color: style.hidden
          ? style.color
          : isSelected
            ? palette.selected
            : isHovered
              ? palette.hover
              : style.color,
        size: isSelected ? 4 : isHovered ? Math.max(style.size, 3) : style.size,
        forceLabel: !style.hidden && labelsVisible,
        zIndex: isSelected || isHovered ? 1 : 0,
      };
    });
    sigma.refresh();
  }, [hoveredEdge, labelsVisible, selected, sigma, theme, visible]);

  /** Restores deterministic coordinates and the default camera after stopping the worker layout. */
  const resetLayout = () => {
    layout.stop();
    setLayoutRunning(false);
    sigma.setCustomBBox(null);
    graph.forEachNode((node, attributes) =>
      sigma.getGraph().mergeNodeAttributes(node, { x: attributes.x, y: attributes.y }),
    );
    camera.reset();
  };

  /** Frames only nodes admitted by the current semantic filters. */
  const focusVisible = () => {
    const bounds = visibleGraphBounds(sigma.getGraph() as MultiDirectedGraph, visible);
    if (!bounds) return;
    sigma.setCustomBBox(bounds);
    camera.reset();
  };

  /** Starts or stops ForceAtlas2 while keeping its coordinates in view-only graph state. */
  const toggleLayout = () => {
    if (layoutRunning) layout.stop();
    else layout.start();
    setLayoutRunning(!layoutRunning);
  };

  return (
    <GraphControls
      layoutRunning={layoutRunning}
      labelsVisible={labelsVisible}
      onZoomIn={() => camera.zoomIn()}
      onZoomOut={() => camera.zoomOut()}
      onFocusAll={focusVisible}
      onToggleLayout={toggleLayout}
      onToggleLabels={() => setLabelsVisible((visible) => !visible)}
      onResetLayout={resetLayout}
      onExportPng={() => downloadGraphPng(sigma, theme)}
    />
  );
}

/** Provides Sigma and worker-layout contexts around the graph runtime. */
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
