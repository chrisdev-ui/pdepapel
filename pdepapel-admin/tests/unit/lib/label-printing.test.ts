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

describe("AH Royal 60-label Carta template", () => {
  it("is a 5 × 12 grid of 38.1 × 21.2 mm labels on a US Letter page (the physical sheet has no 13th row)", () => {
    expect(template).toMatchObject({
      columns: 5,
      rows: 12,
      labelWidthMm: 38.1,
      labelHeightMm: 21.2,
      page: { widthMm: 215.9, heightMm: 279.4, cssSize: "letter" },
    });
    expect(labelsPerSheet(template)).toBe(60);
    // Calibración del 2026-09-19: 1,9 mm recortaba la primera fila; el margen
    // superior arranca centrado (12,5 mm) y sigue marcado como aproximado.
    expect(template.marginTopMm).toBe(12.5);
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
    expect(css).toContain('.label-sheet__slot[data-slot="1"]{left:7.7mm;top:12.5mm}');
    expect(css).toContain(`.label-sheet__slot[data-slot="60"]{left:${7.7 + 4 * 40.6}mm;top:${(12.5 + 11 * 21.2).toFixed(1)}mm}`);
    // No existe una fila 13: ninguna regla para la posición 61.
    expect(css).not.toContain('[data-slot="61"]');
    expect(css).toContain(".label-sheet__qr svg{display:block;width:100%;height:100%}");
    expect(css).toContain("outline:0.15mm solid");
    expect(labelSheetCss(template, { cutGuides: false, offsetXMm: 0, offsetYMm: 0 })).not.toContain("outline:0.15mm solid");
  });

  it("shifts every slot by the print offset", () => {
    const css = labelSheetCss(template, { cutGuides: true, offsetXMm: 1.5, offsetYMm: -0.5 });
    expect(css).toContain('.label-sheet__slot[data-slot="1"]{left:9.2mm;top:12mm}');
  });
});

describe("paginateLabels", () => {
  const labels = Array.from({ length: 70 }, (_, index) => ({ id: `l${index + 1}` }));

  it("fills sheets of 60 and pads the last one with empty slots", () => {
    const result = paginateLabels(labels, template);
    expect(result.pageCount).toBe(2);
    expect(result.pages[0]).toHaveLength(60);
    expect(result.pages[0].every(Boolean)).toBe(true);
    expect(result.pages[1].filter(Boolean)).toHaveLength(10);
    expect(result.pages[1]).toHaveLength(60);
    expect(result.freeOnLastPage).toBe(50);
  });

  it("leaves the first positions empty when starting later on a used sheet", () => {
    const result = paginateLabels(labels.slice(0, 3), template, 59);
    expect(result.skipped).toBe(58);
    expect(result.pages[0].slice(0, 58).every((slot) => slot === null)).toBe(true);
    expect(result.pages[0][58]).toEqual({ id: "l1" });
    expect(result.pageCount).toBe(2);
    expect(result.pages[1][0]).toEqual({ id: "l3" });
  });

  it("clamps a start position past the sheet and handles an empty list", () => {
    expect(paginateLabels(labels.slice(0, 1), template, 999).skipped).toBe(59);
    expect(paginateLabels([], template, 10)).toMatchObject({ pageCount: 0, pages: [] });
  });
});

import { LABEL_HEADING, labelHeadingBudgetPt } from "@/lib/label-printing";

/**
 * El bloque de cabecera mide lo mismo con «Nombre del grupo» (grupo + nombre
 * a una línea) que sin él (nombre a dos líneas): la opción no puede mover la
 * variante ni el SKU, que es el solape que este módulo vino a arreglar.
 */
describe("group name line budget", () => {
  it("keeps the heading height identical with and without the group line", () => {
    const withGroup = labelHeadingBudgetPt({ withGroup: true });
    const without = labelHeadingBudgetPt({ withGroup: false });
    expect(withGroup.totalPt).toBe(without.totalPt);
    expect(withGroup.lines.map((line) => line.role)).toEqual(["group", "title"]);
    expect(without.lines.map((line) => line.role)).toEqual(["title", "title"]);
    expect(withGroup.totalPt).toBe(LABEL_HEADING.linePt * LABEL_HEADING.lines);
  });

  it("emits the same line height for the group and the title and caps the heading at two lines", () => {
    const css = labelSheetCss(getLabelSheetTemplate());
    expect(css).toContain(`.label-sheet__heading{max-height:${LABEL_HEADING.linePt * 2}pt;overflow:hidden}`);
    expect(css).toMatch(new RegExp(`\\.label-sheet__group\\{[^}]*font-size:${LABEL_HEADING.groupPt}pt;line-height:${LABEL_HEADING.linePt}pt`));
    expect(css).toMatch(new RegExp(`\\.label-sheet__title\\{[^}]*font-size:${LABEL_HEADING.titlePt}pt;line-height:${LABEL_HEADING.linePt}pt`));
    expect(css).toContain(".label-sheet__title--single{-webkit-line-clamp:1}");
    expect(LABEL_HEADING.groupPt).toBeLessThan(LABEL_HEADING.titlePt);
    // Los tintes de la vista previa nunca llegan al papel: solo bajo [data-preview].
    expect(css).toContain("[data-preview] .label-sheet__slot--used");
    expect(css).not.toMatch(/(^|\n)\.label-sheet__slot--used/);
  });
});
