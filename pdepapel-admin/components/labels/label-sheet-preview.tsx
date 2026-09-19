"use client";

import { useEffect, useRef, useState } from "react";

import {
  QrLabelPrintSheet,
  type LabelContentOptions,
  type QrPrintLabel,
} from "@/components/labels/qr-label-print-sheet";
import {
  getLabelSheetTemplate,
  paginateLabels,
  PX_PER_MM,
  type LabelSheetOptions,
  type LabelSheetTemplateId,
} from "@/lib/label-printing";

interface LabelSheetPreviewProps {
  labels: QrPrintLabel[];
  templateId?: LabelSheetTemplateId;
  startAt: number;
  sheet: LabelSheetOptions;
  content: LabelContentOptions;
  target?: "product" | "capsule";
  /** Cuántas hojas mostrar; el resto se resume en texto. */
  maxPages?: number;
  className?: string;
}

/**
 * La hoja real, a escala, dentro del ancho disponible: es el mismo componente
 * que se imprime, sólo encogido con `transform`, así la vista previa no puede
 * contar una cosa distinta de la que sale en papel.
 */
export function LabelSheetPreview({
  labels,
  templateId,
  startAt,
  sheet,
  content,
  target = "product",
  maxPages = 2,
  className,
}: LabelSheetPreviewProps) {
  const template = getLabelSheetTemplate(templateId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const pageWidthPx = template.page.widthMm * PX_PER_MM;
  const pageHeightPx = template.page.heightMm * PX_PER_MM;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      if (width > 0) setScale(Math.min(1, width / pageWidthPx));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pageWidthPx]);

  const visible = labels.slice(0, Math.max(0, maxPages * template.columns * template.rows - (startAt - 1)));
  const pageCount = paginateLabels(visible, template, startAt).pageCount;

  return (
    <div ref={containerRef} className={className} data-label-sheet-preview="">
      <div
        style={{
          width: pageWidthPx * scale,
          height: pageCount * (pageHeightPx * scale + 16),
          position: "relative",
          // La hoja interior mide 816 px de caja aunque se pinte encogida:
          // sin esto, esa caja ensancha la columna en celular.
          overflow: "hidden",
        }}
      >
        <div
          style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: pageWidthPx }}
          className="[&_.label-sheet]:mb-4 [&_.label-sheet]:border [&_.label-sheet]:border-slate-200 [&_.label-sheet]:shadow-md"
        >
          <QrLabelPrintSheet
            labels={visible}
            templateId={templateId}
            startAt={startAt}
            sheet={sheet}
            content={content}
            target={target}
            preview
          />
        </div>
      </div>
    </div>
  );
}
