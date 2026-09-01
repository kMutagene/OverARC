/** Commands exposed by the floating Sigma control strip. */
interface GraphControlsProps {
  layoutRunning: boolean;
  labelsVisible: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFocusAll: () => void;
  onToggleLayout: () => void;
  onToggleLabels: () => void;
  onResetLayout: () => void;
  onExportPng: () => void;
}

/** Renders camera, layout, label-visibility, reset, and PNG export controls for the graph view. */
export function GraphControls({
  layoutRunning,
  labelsVisible,
  onZoomIn,
  onZoomOut,
  onFocusAll,
  onToggleLayout,
  onToggleLabels,
  onResetLayout,
  onExportPng,
}: GraphControlsProps) {
  return (
    <div className="graph-controls" aria-label="Graph controls">
      <button type="button" className="secondary" onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
      <button type="button" className="secondary" onClick={onZoomOut} aria-label="Zoom out">
        −
      </button>
      <button type="button" className="secondary" onClick={onFocusAll}>
        Focus all
      </button>
      <button type="button" onClick={onToggleLayout}>
        {layoutRunning ? 'Stop layout' : 'Start layout'}
      </button>
      <button
        type="button"
        className="secondary"
        aria-pressed={labelsVisible}
        onClick={onToggleLabels}
      >
        {labelsVisible ? 'Hide labels' : 'Show labels'}
      </button>
      <button type="button" className="secondary" onClick={onResetLayout}>
        Reset layout
      </button>
      <button type="button" className="secondary" onClick={onExportPng}>
        PNG
      </button>
    </div>
  );
}
