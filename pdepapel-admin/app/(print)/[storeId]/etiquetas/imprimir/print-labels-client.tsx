"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  LabelSheetStyles,
  QrLabelPrintSheet,
  readLabelPrintJob,
  type LabelPrintJob,
} from "@/components/labels/qr-label-print-sheet";
import { PrintOffsetFields } from "@/components/labels/print-offset-fields";
import { useSheetOptions } from "@/components/labels/use-sheet-options";
import { Button } from "@/components/ui/button";
import {
  getLabelSheetTemplate,
  labelsPerSheet,
  paginateLabels,
  PX_PER_MM,
  sheetFitsPage,
  type LabelSheetOptions,
} from "@/lib/label-printing";

interface PrintLabelsClientProps {
  storeId: string;
  mode: "etiquetas" | "calibracion";
}

const mm = (value: number) => `${Math.round(value * 1000) / 1000}mm`;

/**
 * Hoja de calibración: el contorno de las 60 posiciones, numeradas, y una
 * regla en mm por cada borde. Se imprime sobre papel normal y se pone detrás
 * de la hoja adhesiva al trasluz: si los contornos caen sobre las etiquetas,
 * la plantilla está bien; si no, se ajusta el desplazamiento. Obedece las
 * mismas opciones (desplazamiento) que la impresión real: antes usaba las de
 * fábrica y el ajuste guardado nunca llegaba a esta hoja.
 */
export function CalibrationSheet({ storeId, options }: { storeId: string; options: LabelSheetOptions }) {
  const template = getLabelSheetTemplate();
  const perPage = labelsPerSheet(template);
  const fit = sheetFitsPage(template);
  const ticksX = Array.from({ length: Math.floor(template.page.widthMm / 10) }, (_, index) => (index + 1) * 10);
  const ticksY = Array.from({ length: Math.floor(template.page.heightMm / 10) }, (_, index) => (index + 1) * 10);
  return (
    <>
      <LabelSheetStyles template={template} options={{ ...options, cutGuides: true }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .calibration__tick{position:absolute;font-size:5pt;color:#64748b;font-family:ui-monospace,Menlo,monospace}
        .calibration__tick--x{top:0;height:2.5mm;border-left:0.15mm solid #94a3b8;padding-left:0.4mm;line-height:2.5mm}
        .calibration__tick--y{left:0;width:2.5mm;border-top:0.15mm solid #94a3b8;padding-top:0.2mm}
        .calibration__number{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:7pt;font-weight:700;color:#94a3b8}
        .calibration__legend{position:absolute;left:${mm(template.marginLeftMm)};bottom:${mm(Math.max(1, template.page.heightMm - fit.bottomMm - 0.4))};font-size:5.5pt;color:#64748b;max-width:${mm(template.page.widthMm - template.marginLeftMm * 2)}}
      `,
        }}
      />
      <div className="label-sheet" data-calibration="">
        {ticksX.map((value) => (
          <span key={`x-${value}`} className="calibration__tick calibration__tick--x" style={{ left: mm(value) }}>
            {value}
          </span>
        ))}
        {ticksY.map((value) => (
          <span key={`y-${value}`} className="calibration__tick calibration__tick--y" style={{ top: mm(value) }}>
            {value}
          </span>
        ))}
        {Array.from({ length: perPage }, (_, index) => (
          <div className="label-sheet__slot" data-slot={index + 1} key={index}>
            <span className="calibration__number">{index + 1}</span>
          </div>
        ))}
        <p className="calibration__legend">
          Hoja de calibración · {template.reference} · tienda {storeId.slice(0, 8)} · desplazamiento{" "}
          {options.offsetXMm} / {options.offsetYMm} mm · escala 100 %, sin «ajustar a página». Pon esta hoja detrás de
          la adhesiva al trasluz: cada contorno debe caer sobre una etiqueta. Si se corre, ajusta «Desplazar impresión»
          arriba y vuelve a imprimir.
        </p>
      </div>
    </>
  );
}

/**
 * En pantalla la hoja se encoge para caber en el ancho del dispositivo (un
 * celular no puede mostrar 216 mm); al imprimir se deja a tamaño real.
 */
function FitOnScreen({ pages, children }: { pages: number; children: React.ReactNode }) {
  const template = getLabelSheetTemplate();
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const widthPx = template.page.widthMm * PX_PER_MM;
  const heightPx = template.page.heightMm * PX_PER_MM;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setScale(Math.min(1, element.clientWidth / widthPx));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [widthPx]);
  return (
    <div ref={ref} className="w-full overflow-hidden print:w-auto print:overflow-visible" data-screen-scale="">
      {/* Sin «>» en el texto del estilo: el servidor lo escapa y la hidratación no cuadra. */}
      <style dangerouslySetInnerHTML={{ __html: "@media print{.label-sheet-scaler{transform:none !important;width:auto !important;height:auto !important}}" }} />
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: widthPx,
          height: Math.max(1, pages) * (heightPx + 24) * scale,
        }}
        className="label-sheet-scaler print:h-auto [&_.label-sheet]:mb-6 [&_.label-sheet]:shadow-lg print:[&_.label-sheet]:mb-0 print:[&_.label-sheet]:shadow-none"
      >
        {children}
      </div>
    </div>
  );
}

export function PrintLabelsClient({ storeId, mode }: PrintLabelsClientProps) {
  const [job, setJob] = useState<LabelPrintJob | null | undefined>(undefined);
  const template = getLabelSheetTemplate();
  const fit = sheetFitsPage(template);
  // El desplazamiento guardado por navegador manda también aquí: se ajusta
  // mirando la hoja y la siguiente impresión (esta o la del panel) lo usa.
  const { options: sheetOptions, setOptions: setSheetOptions } = useSheetOptions(storeId);
  const effectiveSheet = useMemo(
    () => (job ? { ...job.sheet, offsetXMm: sheetOptions.offsetXMm, offsetYMm: sheetOptions.offsetYMm } : sheetOptions),
    [job, sheetOptions],
  );

  useEffect(() => {
    if (mode === "calibracion") {
      setJob(null);
      return;
    }
    const found = readLabelPrintJob(storeId);
    setJob(found);
  }, [mode, storeId]);

  const pagination = useMemo(
    () => (job ? paginateLabels(job.labels, template, job.startAt) : null),
    [job, template],
  );

  // Abre el diálogo de impresión sola una vez que las hojas están pintadas.
  useEffect(() => {
    if (mode !== "etiquetas" || !job || job.labels.length === 0) return;
    const timer = window.setTimeout(() => window.print(), 600);
    return () => window.clearTimeout(timer);
  }, [mode, job]);

  const backHref = `/${storeId}/${job?.source === "capsule" ? "ferias" : "ventas-rapidas?tab=etiquetas"}`;

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-white/95 px-4 py-3 text-sm backdrop-blur print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Volver
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold text-primary">
            {mode === "calibracion" ? "Hoja de calibración" : "Etiquetas para imprimir"}
          </span>
          <span className="text-xs text-muted-foreground">
            {mode === "calibracion"
              ? `${template.reference} · imprime en papel normal y compárala con una hoja adhesiva.`
              : pagination && job
                ? `${job.labels.length} ${job.labels.length === 1 ? "etiqueta" : "etiquetas"} · ${pagination.pageCount} ${pagination.pageCount === 1 ? "hoja" : "hojas"} carta · ${template.name}${job.startAt > 1 ? ` · desde la posición ${job.startAt}` : ""}`
                : "Papel carta · escala 100 % (tamaño real) · sin «ajustar a página»."}
          </span>
        </div>
        <Button type="button" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          Imprimir o guardar PDF
        </Button>
        <div className="flex w-full flex-wrap items-end gap-x-6 gap-y-2 border-t pt-3">
          <span className="text-xs font-semibold text-primary">Desplazar impresión (se guarda en este navegador)</span>
          <PrintOffsetFields value={sheetOptions} onChange={setSheetOptions} idPrefix="print-offset" compact />
        </div>
      </header>

      {!fit.fits && (
        <p className="mx-4 mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 print:hidden">
          La plantilla se sale del papel ({fit.rightMm} × {fit.bottomMm} mm): revisa la geometría antes de imprimir.
        </p>
      )}

      <main className="flex flex-col items-center gap-6 bg-slate-100 p-4 print:block print:bg-white print:p-0">
        {mode === "calibracion" ? (
          <FitOnScreen pages={1}>
            <CalibrationSheet storeId={storeId} options={sheetOptions} />
          </FitOnScreen>
        ) : job === undefined ? (
          <p className="text-sm text-muted-foreground">Preparando la hoja…</p>
        ) : !job || job.labels.length === 0 ? (
          <div className="max-w-md rounded-xl border bg-white p-6 text-center text-sm">
            <p className="font-semibold text-primary">No hay etiquetas para imprimir</p>
            <p className="mt-1 text-muted-foreground">
              Vuelve a Punto de venta → Etiquetas, arma la hoja y pulsa «Imprimir o guardar PDF».
            </p>
          </div>
        ) : (
          <FitOnScreen pages={pagination?.pageCount ?? 1}>
            <QrLabelPrintSheet
              labels={job.labels}
              templateId={job.templateId}
              startAt={job.startAt}
              sheet={effectiveSheet}
              content={job.content}
              target={job.source}
            />
          </FitOnScreen>
        )}
      </main>
    </div>
  );
}
