import type Sigma from 'sigma';
import { drawDiscNodeLabel, type NodeHoverDrawingFunction } from 'sigma/rendering';
import type { Theme } from '../../shared/types';

export const GRAPH_THEME = {
  light: {
    background: '#f4f5f6',
    label: '#173c3a',
    hover: '#087f73',
    selected: '#d14d2f',
    hoverSurface: '#ffffff',
    hoverShadow: '#173c3a80',
  },
  dark: {
    background: '#111817',
    label: '#e1ece9',
    hover: '#43c6b6',
    selected: '#ff8066',
    hoverSurface: '#202b29',
    hoverShadow: '#000000b3',
  },
} as const;

function createNodeHoverRenderer(background: string, shadow: string): NodeHoverDrawingFunction {
  return (context, data, settings) => {
    const size = settings.labelSize;
    context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
    context.fillStyle = background;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.shadowBlur = 8;
    context.shadowColor = shadow;
    const padding = 2;
    if (typeof data.label === 'string') {
      const textWidth = context.measureText(data.label).width;
      const boxWidth = Math.round(textWidth + 5);
      const boxHeight = Math.round(size + 2 * padding);
      const radius = Math.max(data.size, size / 2) + padding;
      const angle = Math.asin(boxHeight / 2 / radius);
      const delta = Math.sqrt(Math.abs(radius ** 2 - (boxHeight / 2) ** 2));
      context.beginPath();
      context.moveTo(data.x + delta, data.y + boxHeight / 2);
      context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2);
      context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2);
      context.lineTo(data.x + delta, data.y - boxHeight / 2);
      context.arc(data.x, data.y, radius, angle, -angle);
      context.closePath();
      context.fill();
    } else {
      context.beginPath();
      context.arc(data.x, data.y, data.size + padding, 0, Math.PI * 2);
      context.closePath();
      context.fill();
    }
    context.shadowBlur = 0;
    drawDiscNodeLabel(context, data, settings);
  };
}

export const HOVER_RENDERERS = {
  light: createNodeHoverRenderer(GRAPH_THEME.light.hoverSurface, GRAPH_THEME.light.hoverShadow),
  dark: createNodeHoverRenderer(GRAPH_THEME.dark.hoverSurface, GRAPH_THEME.dark.hoverShadow),
};

export function downloadGraphPng(sigma: Sigma, theme: Theme) {
  const canvases = Object.values(sigma.getCanvases());
  const source = canvases[0];
  if (!source) return;
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d');
  if (!context) return;
  context.fillStyle = GRAPH_THEME[theme].background;
  context.fillRect(0, 0, output.width, output.height);
  canvases.forEach((canvas) => context.drawImage(canvas, 0, 0));
  const link = document.createElement('a');
  link.download = 'overarc-visible-graph.png';
  link.href = output.toDataURL('image/png');
  link.click();
}
