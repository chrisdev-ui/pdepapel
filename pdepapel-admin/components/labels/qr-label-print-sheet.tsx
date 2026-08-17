"use client";

import { QRCodeSVG } from "qrcode.react";

import {
  getLabelPrintFormat,
  type LabelPrintFormat,
} from "@/lib/label-printing";

export type QrPrintLabel = {
  id: string;
  code: string;
  title: string;
  subtitle?: string;
};

export type QrLabelPrintTarget = "product" | "capsule";

type QrLabelPrintSheetProps = {
  target: QrLabelPrintTarget;
  labels: QrPrintLabel[];
  format: LabelPrintFormat;
};

function chunkLabels(labels: QrPrintLabel[], itemsPerPage: number) {
  const pages: QrPrintLabel[][] = [];

  for (let index = 0; index < labels.length; index += itemsPerPage) {
    pages.push(labels.slice(index, index + itemsPerPage));
  }

  return pages;
}

const labelPrintDocumentStyles = `
  @page {
    size: A4 portrait;
    margin: 3.3mm;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #fff;
  }

  [data-qr-label-sheet] {
    width: 100%;
  }

  .print-label-page {
    display: grid;
    margin: 0 auto;
    break-after: page;
    page-break-after: always;
  }

  .print-label-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .qr-print-label {
    display: grid;
    align-items: center;
    overflow: hidden;
    background: #fff;
    color: #0f172a;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .qr-print-label-code,
  .qr-print-label-code svg {
    display: block;
  }

  .qr-print-label-code svg {
    width: 100%;
    height: 100%;
  }

  .qr-print-label-title {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: #0f172a;
    font-size: 5.5pt;
    font-weight: 700;
    line-height: 1.2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .qr-print-label-subtitle {
    margin: 0.8mm 0 0;
    overflow: hidden;
    color: #475569;
    font-size: 4.8pt;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  [data-label-print-format="COMPACT_65"] .print-label-page {
    width: 202.9mm;
    grid-template-columns: repeat(5, 38.1mm);
    grid-auto-rows: 21.2mm;
    gap: 1.2mm 3.1mm;
  }

  [data-label-print-format="COMPACT_65"] .qr-print-label {
    grid-template-columns: 18mm minmax(0, 1fr);
    gap: 0.8mm;
    padding: 1mm;
  }

  [data-label-print-format="COMPACT_65"] .qr-print-label-code {
    width: 18mm;
    height: 18mm;
  }

  [data-label-print-format="STANDARD_40"] .print-label-page {
    width: 201mm;
    grid-template-columns: repeat(4, 48mm);
    grid-auto-rows: 28mm;
    gap: 1mm 3mm;
  }

  [data-label-print-format="STANDARD_40"] .qr-print-label {
    grid-template-columns: 22mm minmax(0, 1fr);
    gap: 1.5mm;
    padding: 2mm;
  }

  [data-label-print-format="STANDARD_40"] .qr-print-label-code {
    width: 22mm;
    height: 22mm;
  }
`;

export function printQrLabelSheet(target: QrLabelPrintTarget) {
  const source = document.querySelector<HTMLElement>(
    `[data-qr-label-sheet="${target}"]`,
  );
  if (!source) return false;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  printWindow.document.write(`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Etiquetas P de Papel</title>
        <style>${labelPrintDocumentStyles}</style>
      </head>
      <body>${source.outerHTML}</body>
    </html>`);
  printWindow.document.close();
  printWindow.addEventListener("afterprint", () => printWindow.close(), {
    once: true,
  });

  const startPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    window.setTimeout(startPrint, 100);
  } else {
    printWindow.addEventListener("load", startPrint, { once: true });
  }

  return true;
}

export function QrLabelPrintSheet({
  target,
  labels,
  format,
}: QrLabelPrintSheetProps) {
  const labelFormat = getLabelPrintFormat(format);
  const pages = chunkLabels(labels, labelFormat.itemsPerPage);

  return (
    <div
      data-qr-label-sheet={target}
      data-label-print-format={format}
      className="space-y-3"
    >
      {pages.map((page, pageIndex) => (
        <div
          className="print-label-page grid grid-cols-2 gap-3 sm:grid-cols-4"
          key={`${target}-${pageIndex}`}
        >
          {page.map((label, index) => (
            <article
              className="qr-print-label grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border bg-white p-2 text-slate-900"
              key={`${label.id}-${pageIndex}-${index}`}
            >
              <div className="qr-print-label-code h-20 w-20 shrink-0">
                <QRCodeSVG value={label.code} size={128} includeMargin />
              </div>
              <div className="min-w-0 text-left">
                <p className="qr-print-label-title line-clamp-2 text-xs font-semibold leading-tight">
                  {label.title}
                </p>
                {label.subtitle && (
                  <p className="qr-print-label-subtitle mt-1 truncate text-[10px] text-slate-500">
                    {label.subtitle}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      ))}
    </div>
  );
}
