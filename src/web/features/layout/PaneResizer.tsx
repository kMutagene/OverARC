import { useRef } from 'react';

interface PaneResizerProps {
  side: 'left' | 'right';
  width: number;
  maxWidth: number;
  onResize: (clientX: number) => void;
  onResizeBy: (delta: number) => void;
  onCollapse: () => void;
  onToggle: () => void;
}

export function PaneResizer({
  side,
  width,
  maxWidth,
  onResize,
  onResizeBy,
  onCollapse,
  onToggle,
}: PaneResizerProps) {
  const dragging = useRef(false);
  const collapsed = width === 0;

  const finishDrag = (target: HTMLDivElement, pointerId: number) => {
    dragging.current = false;
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    document.body.classList.remove('resizing-panes');
  };

  return (
    <div
      className={`pane-resizer ${side} ${collapsed ? 'collapsed' : ''}`}
      role="separator"
      aria-label={`Resize ${side} pane`}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      aria-valuetext={collapsed ? 'Collapsed' : `${Math.round(width)} pixels`}
      tabIndex={0}
      title={`Drag to resize the ${side} pane. Double-click to ${collapsed ? 'restore' : 'collapse'}.`}
      onDoubleClick={onToggle}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.classList.add('resizing-panes');
        onResize(event.clientX);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        onResize(event.clientX);
        event.preventDefault();
      }}
      onPointerUp={(event) => finishDrag(event.currentTarget, event.pointerId)}
      onPointerCancel={(event) => finishDrag(event.currentTarget, event.pointerId)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 50 : 10;
        if (event.key === 'Home') {
          onCollapse();
          event.preventDefault();
        } else if (event.key === 'Enter' || event.key === ' ') {
          onToggle();
          event.preventDefault();
        } else if (event.key === 'ArrowLeft') {
          onResizeBy(side === 'left' ? -step : step);
          event.preventDefault();
        } else if (event.key === 'ArrowRight') {
          onResizeBy(side === 'left' ? step : -step);
          event.preventDefault();
        }
      }}
    />
  );
}
