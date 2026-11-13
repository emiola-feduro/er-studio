import { getNodesBounds, useReactFlow } from '@xyflow/react';
import { toBlob, toPng, toSvg } from 'html-to-image';
import { useCallback } from 'react';
import { downloadDataUrl, slug } from '../../lib/project-file';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';

const PADDING = 40;

export type ImageFormat = 'png' | 'svg' | 'copy-png';

/** Exports the whole diagram (not just the visible part) as PNG or SVG, or copies it as PNG. */
const useExportImage = () => {
  const { getNodes } = useReactFlow();

  return useCallback(
    async (format: ImageFormat) => {
      const { notify, view, setView } = useUiStore.getState();
      const project = useProjectStore.getState().project;
      const nodes = getNodes();
      if (!project || nodes.length === 0) {
        notify('No hay nada que exportar todavía.', 'error');
        return;
      }

      const render = async () => {
        if (useUiStore.getState().view !== 'diagram') {
          setView('diagram');
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        const viewportEl = document.querySelector<HTMLElement>('.react-flow__viewport');
        if (!viewportEl) throw new Error('no viewport');
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
        return { viewportEl, options };
      };

      if (format === 'copy-png') {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
          notify('Este navegador no permite copiar imágenes. Descarga el PNG.', 'error');
          return;
        }
        // The clipboard write must start right away, inside the click, so the image goes in as a pending promise.
        const blob = render().then(async ({ viewportEl, options }) => {
          const result = await toBlob(viewportEl, options);
          if (!result) throw new Error('empty image');
          return result;
        });
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          notify('Imagen PNG copiada al portapapeles.');
        } catch {
          notify('No se pudo copiar la imagen. Revisa los permisos del portapapeles o descarga el PNG.', 'error');
        } finally {
          if (view !== 'diagram') setView(view);
        }
        return;
      }

      try {
        const { viewportEl, options } = await render();
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
