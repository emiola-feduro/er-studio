import { getNodesBounds, useReactFlow } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import { useCallback } from 'react';
import { downloadDataUrl, slug } from '../../lib/project-file';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';

const PADDING = 40;

/** Exports the whole diagram (not just the visible part) as PNG or SVG. */
const useExportImage = () => {
  const { getNodes } = useReactFlow();

  return useCallback(
    async (format: 'png' | 'svg') => {
      const { notify, view, setView } = useUiStore.getState();
      const project = useProjectStore.getState().project;
      const nodes = getNodes();
      if (!project || nodes.length === 0) {
        notify('No hay nada que exportar todavía.', 'error');
        return;
      }
      if (view !== 'diagram') {
        setView('diagram');
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const viewportEl = document.querySelector<HTMLElement>('.react-flow__viewport');
      if (!viewportEl) return;
      const bounds = getNodesBounds(nodes);
      const width = Math.ceil(bounds.width + PADDING * 2);
      const height = Math.ceil(bounds.height + PADDING * 2);
      // 1:1 scale, shifted so the top-left table sits PADDING pixels from the edge.
      const viewport = { x: PADDING - bounds.x, y: PADDING - bounds.y, zoom: 1 };
      const background = getComputedStyle(document.documentElement).getPropertyValue('--c-canvas').trim() || '#ffffff';
      const options = {
        backgroundColor: background,
        width,
        height,
        pixelRatio: 2,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      };
      try {
        const dataUrl = format === 'png' ? await toPng(viewportEl, options) : await toSvg(viewportEl, options);
        downloadDataUrl(`${slug(project.name)}-er.${format}`, dataUrl);
      } catch {
        notify('No se pudo generar la imagen.', 'error');
      }
    },
    [getNodes],
  );
};

export default useExportImage;
