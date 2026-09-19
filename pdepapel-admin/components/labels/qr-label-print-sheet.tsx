"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo } from "react";

import {
  DEFAULT_LABEL_SHEET,
  DEFAULT_SHEET_OPTIONS,
  getLabelSheetTemplate,
  labelSheetCss,
  paginateLabels,
  SKU_LONG_THRESHOLD,
  type LabelSheetOptions,
  type LabelSheetTemplate,
  type LabelSheetTemplateId,
} from "@/lib/label-printing";

/** Una etiqueta: el QR lleva `code`; el resto es lo que se lee a ojo. */
export type QrPrintLabel = {
  id: string;
  code: string;
  title: string;
  variant?: string | null;
  sku?: string | null;
  price?: number | null;
  /** Nombre del grupo, solo si la etiqueta entró como parte de un grupo. */
  group?: string | null;
};

export interface LabelContentOptions {
  showVariant: boolean;
  showSku: boolean;
  showPrice: boolean;
  showGroupName: boolean;
}

export const DEFAULT_CONTENT_OPTIONS: LabelContentOptions = {
  showVariant: true,
  showSku: true,
  showPrice: false,
  showGroupName: false,
};

export type LabelPrintMode = "etiquetas" | "calibracion" | "vista";

export interface LabelPrintJob {
  storeId: string;
  /** Para que la página de impresión sepa de dónde volver. */
  source: "product" | "capsule";
  labels: QrPrintLabel[];
  templateId: LabelSheetTemplateId;
  startAt: number;
  sheet: LabelSheetOptions;
  content: LabelContentOptions;
  createdAt: string;
}

const priceFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/**
 * La hoja de estilos de la plantilla, inyectada donde se pinte la hoja: en la
 * vista previa del panel y en la página de impresión, la misma.
 */
export function LabelSheetStyles({
  template,
  options,
}: {
  template: LabelSheetTemplate;
  options: LabelSheetOptions;
}) {
  const css = useMemo(() => labelSheetCss(template, options), [template, options]);
  // CSS como HTML crudo: como texto, el servidor escapa las comillas
  // (`content:""` → `&quot;`) y un <style> no decodifica entidades, así que la
  // hidratación no cuadraba en la página de calibración.
  return <style data-label-sheet-css="" dangerouslySetInnerHTML={{ __html: css }} />;
}

function LabelSlot({ label, content, slot }: { label: QrPrintLabel; content: LabelContentOptions; slot: number }) {
  const sku = content.showSku && label.sku ? label.sku : null;
  // El grupo va encima del nombre y le quita una línea: el bloque mide lo
  // mismo con o sin él (ver LABEL_HEADING). Sin grupo no hay línea vacía.
  const group = content.showGroupName && label.group ? label.group : null;
  return (
    <div className="label-sheet__slot" data-slot={slot} data-label-id={label.id}>
      <div className="label-sheet__qr">
        {/* Nivel M y zona de silencio: la etiqueta se manosea y se lee con el celular. */}
        <QRCodeSVG value={label.code} size={256} level="M" includeMargin style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="label-sheet__text">
        <div className="label-sheet__heading">
          {group && <p className="label-sheet__group">{group}</p>}
          <p className={`label-sheet__title${group ? " label-sheet__title--single" : ""}`}>{label.title}</p>
        </div>
        {content.showVariant && label.variant && (
          <p className="label-sheet__variant">{label.variant}</p>
        )}
        {sku && (
          <p className={`label-sheet__sku${sku.length > SKU_LONG_THRESHOLD ? " label-sheet__sku--long" : ""}`}>
            {sku}
          </p>
        )}
        {content.showPrice && typeof label.price === "number" && (
          <p className="label-sheet__price">{priceFormatter.format(label.price)}</p>
        )}
      </div>
    </div>
  );
}

interface LabelSheetProps {
  labels: QrPrintLabel[];
  templateId?: LabelSheetTemplateId;
  startAt?: number;
  sheet?: LabelSheetOptions;
  content?: LabelContentOptions;
  /** Marca de la hoja para que las pruebas y la impresión la encuentren. */
  target?: "product" | "capsule";
  /** En pantalla: tiñe las posiciones ya usadas y la siguiente libre (nunca en papel). */
  preview?: boolean;
}

/**
 * Las hojas, una debajo de otra, a tamaño real en mm. Quien la muestre en
 * pantalla la escala con `transform`; la página de impresión la deja tal cual.
 */
export function QrLabelPrintSheet({
  labels,
  templateId = DEFAULT_LABEL_SHEET,
  startAt = 1,
  sheet = DEFAULT_SHEET_OPTIONS,
  content = DEFAULT_CONTENT_OPTIONS,
  target = "product",
  preview = false,
}: LabelSheetProps) {
  const template = getLabelSheetTemplate(templateId);
  const pagination = useMemo(() => paginateLabels(labels, template, startAt), [labels, template, startAt]);
  const lastPage = pagination.pages.length - 1;
  const lastUsed = pagination.pages[lastPage]?.reduce((last, label, index) => (label ? index : last), -1) ?? -1;
  const emptyState = (pageIndex: number, index: number) => {
    if (!preview) return "";
    if (pageIndex === 0 && index < startAt - 1) return " label-sheet__slot--used";
    if (pageIndex === lastPage && labels.length > 0 && index === lastUsed + 1) return " label-sheet__slot--next";
    return "";
  };
  return (
    <div data-qr-label-sheet={target} data-label-template={template.id} data-preview={preview ? "" : undefined}>
      <LabelSheetStyles template={template} options={sheet} />
      {pagination.pages.map((page, pageIndex) => (
        <div className="label-sheet" key={`${target}-${pageIndex}`} data-page={pageIndex + 1}>
          {page.map((label, index) =>
            label ? (
              <LabelSlot key={`${label.id}-${pageIndex}-${index}`} label={label} content={content} slot={index + 1} />
            ) : (
              <div
                className={`label-sheet__slot label-sheet__slot--empty${emptyState(pageIndex, index)}`}
                data-slot={index + 1}
                key={`empty-${pageIndex}-${index}`}
                aria-hidden="true"
              />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export const PRINT_JOB_STORAGE_KEY = "pdepapel:etiquetas:trabajo";

export function printJobStorageKey(storeId: string) {
  return `${PRINT_JOB_STORAGE_KEY}:${storeId}`;
}

export function labelPrintUrl(storeId: string, mode: LabelPrintMode = "etiquetas") {
  return `/${storeId}/etiquetas/imprimir${mode === "etiquetas" ? "" : `?modo=${mode}`}`;
}

/**
 * Deja el trabajo en el navegador y abre la página de impresión en otra
 * pestaña. Sin ventana emergente con `document.write`: la página es una ruta
 * real del panel, con la misma letra, que también sirve para guardar PDF y
 * funciona en el iPad (Compartir → Imprimir).
 */
export function openLabelPrintJob(job: LabelPrintJob, mode: Extract<LabelPrintMode, "etiquetas" | "vista"> = "etiquetas") {
  try {
    window.localStorage.setItem(printJobStorageKey(job.storeId), JSON.stringify(job));
  } catch {
    return false;
  }
  const url = labelPrintUrl(job.storeId, mode);
  const tab = window.open(url, "_blank", "noopener");
  if (!tab) window.location.assign(url);
  return true;
}

export function readLabelPrintJob(storeId: string): LabelPrintJob | null {
  try {
    const raw = window.localStorage.getItem(printJobStorageKey(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LabelPrintJob>;
    if (!Array.isArray(parsed.labels)) return null;
    return {
      storeId,
      source: parsed.source === "capsule" ? "capsule" : "product",
      labels: parsed.labels,
      templateId: parsed.templateId ?? DEFAULT_LABEL_SHEET,
      startAt: Number(parsed.startAt) || 1,
      sheet: { ...DEFAULT_SHEET_OPTIONS, ...(parsed.sheet ?? {}) },
      content: { ...DEFAULT_CONTENT_OPTIONS, ...(parsed.content ?? {}) },
      createdAt: parsed.createdAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
