import { describe, expect, it } from "vitest";

import {
  DEFAULT_LABEL_SHEET,
  getLabelSheetTemplate,
  labelGeometry,
  labelSheetCss,
  labelsPerSheet,
  paginateLabels,
  sheetFitsPage,
} from "@/lib/label-printing";

const template = getLabelSheetTemplate(DEFAULT_LABEL_SHEET);

describe("AH Royal 65-label Carta template", () => {
  it("is a 5 × 13 grid of 38.1 × 21.2 mm labels on a US Letter page", () => {
    expect(template).toMatchObject({
      columns: 5,
      rows: 13,
      labelWidthMm: 38.1,
      labelHeightMm: 21.2,
      page: { widthMm: 215.9, heightMm: 279.4, cssSize: "letter" },
    });
    expect(labelsPerSheet(template)).toBe(65);
    // Sin ficha del fabricante: la geometría se confirma con la hoja de calibración.
    expect(template.provisional).toBe(true);
  });

  it("keeps every label inside the page", () => {
    const fit = sheetFitsPage(template);
    expect(fit.fits).toBe(true);
    expect(fit.rightMm).toBeLessThanOrEqual(template.page.widthMm);
    expect(fit.bottomMm).toBeLessThanOrEqual(template.page.heightMm);
  });

  /**
   * El solape original: el QR se pintaba a 128 px dentro de una caja de 80 px
   * y pisaba el texto. Ahora QR y texto salen de la misma cuenta en mm, y esa
   * cuenta no puede dar dos cajas que se toquen ni una que se salga.
   */
  it("gives the QR and the text separate boxes that both fit inside the label", () => {
    const { label, qr, text } = labelGeometry(template);
    expect(qr.xMm).toBeGreaterThanOrEqual(0);
    expect(qr.xMm + qr.widthMm).toBeLessThanOrEqual(text.xMm);
    expect(text.xMm + text.widthMm).toBeLessThanOrEqual(label.widthMm);
    expect(qr.yMm + qr.heightMm).toBeLessThanOrEqual(label.heightMm);
    expect(text.yMm + text.heightMm).toBeLessThanOrEqual(label.heightMm);
    expect(qr.widthMm).toBe(17);
    // Queda sitio útil para el texto (más de un tercio de la etiqueta).
    expect(text.widthMm).toBeGreaterThan(label.widthMm / 3);
  });

  it("emits the page size, absolute slot positions and a full-width QR in its CSS", () => {
    const css = labelSheetCss(template);
    expect(css).toContain("@page{size:letter;margin:0}");
    expect(css).toContain('.label-sheet__slot[data-slot="1"]{left:7.7mm;top:1.9mm}');
    expect(css).toContain(`.label-sheet__slot[data-slot="65"]{left:${7.7 + 4 * 40.6}mm;top:${(1.9 + 12 * 21.2).toFixed(1)}mm}`);
    expect(css).toContain(".label-sheet__qr svg{display:block;width:100%;height:100%}");
    expect(css).toContain("outline:0.15mm solid");
    expect(labelSheetCss(template, { cutGuides: false, offsetXMm: 0, offsetYMm: 0 })).not.toContain("outline:0.15mm solid");
  });

  it("shifts every slot by the print offset", () => {
    const css = labelSheetCss(template, { cutGuides: true, offsetXMm: 1.5, offsetYMm: -0.5 });
    expect(css).toContain('.label-sheet__slot[data-slot="1"]{left:9.2mm;top:1.4mm}');
  });
});

describe("paginateLabels", () => {
  const labels = Array.from({ length: 70 }, (_, index) => ({ id: `l${index + 1}` }));

  it("fills sheets of 65 and pads the last one with empty slots", () => {
    const result = paginateLabels(labels, template);
    expect(result.pageCount).toBe(2);
    expect(result.pages[0].every(Boolean)).toBe(true);
    expect(result.pages[1].filter(Boolean)).toHaveLength(5);
    expect(result.pages[1]).toHaveLength(65);
    expect(result.freeOnLastPage).toBe(60);
  });

  it("leaves the first positions empty when starting later on a used sheet", () => {
    const result = paginateLabels(labels.slice(0, 3), template, 64);
    expect(result.skipped).toBe(63);
    expect(result.pages[0].slice(0, 63).every((slot) => slot === null)).toBe(true);
    expect(result.pages[0][63]).toEqual({ id: "l1" });
    expect(result.pageCount).toBe(2);
    expect(result.pages[1][0]).toEqual({ id: "l3" });
  });

  it("clamps a start position past the sheet and handles an empty list", () => {
    expect(paginateLabels(labels.slice(0, 1), template, 999).skipped).toBe(64);
    expect(paginateLabels([], template, 10)).toMatchObject({ pageCount: 0, pages: [] });
  });
});
