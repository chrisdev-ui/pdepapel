// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalibrationSheet, PrintLabelsClient } from "@/app/(print)/[storeId]/etiquetas/imprimir/print-labels-client";
import { DEFAULT_SHEET_OPTIONS } from "@/lib/label-printing";
import { printJobStorageKey } from "@/components/labels/qr-label-print-sheet";
import { labelDraftStorageKey } from "@/lib/label-sheet-draft";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

beforeEach(() => {
  window.localStorage.clear();
  (window as unknown as { ResizeObserver?: unknown }).ResizeObserver = undefined;
});
afterEach(cleanup);

describe("CalibrationSheet", () => {
  it("renders exactly 60 numbered positions, 5 × 12, and no 13th row", () => {
    const { container } = render(<CalibrationSheet storeId="store-1" options={DEFAULT_SHEET_OPTIONS} />);
    const slots = container.querySelectorAll(".label-sheet__slot");
    expect(slots).toHaveLength(60);
    expect(slots[0].textContent).toBe("1");
    expect(slots[59].textContent).toBe("60");
    expect(container.querySelector('[data-slot="61"]')).toBeNull();
    const css = container.querySelector("style[data-label-sheet-css]")?.textContent ?? "";
    expect(css).toContain('[data-slot="60"]{left:170.1mm;top:245.7mm}');
    expect(css).not.toContain('[data-slot="61"]');
  });

  /**
   * Christian subió el desplazamiento vertical en el panel y reimprimió la
   * calibración: no se movió nada, porque esta hoja se pintaba con las
   * opciones de fábrica. Ahora obedece el mismo desplazamiento.
   */
  it("applies the stored print offset to the calibration grid", () => {
    const { container } = render(
      <CalibrationSheet storeId="store-1" options={{ cutGuides: true, offsetXMm: -1, offsetYMm: 2.5 }} />,
    );
    const css = container.querySelector("style[data-label-sheet-css]")?.textContent ?? "";
    expect(css).toContain('[data-slot="1"]{left:6.7mm;top:15mm}');
    expect(container.textContent).toContain("desplazamiento -1 / 2.5 mm");
  });
});

describe("PrintLabelsClient in calibration mode", () => {
  it("shows the offset control on the page, reads the saved value and writes changes back to the browser draft", async () => {
    window.localStorage.setItem(
      labelDraftStorageKey("store-1"),
      JSON.stringify({ batches: [], startAt: 1, sheet: { cutGuides: true, offsetXMm: 0, offsetYMm: 3 } }),
    );
    const { container } = render(<PrintLabelsClient storeId="store-1" mode="calibracion" />);
    const vertical = await screen.findByLabelText("Vertical");
    expect(vertical).toHaveValue(3);
    let css = container.querySelector("style[data-label-sheet-css]")?.textContent ?? "";
    expect(css).toContain('[data-slot="1"]{left:7.7mm;top:15.5mm}');

    fireEvent.click(screen.getByRole("button", { name: "Vertical: sumar 0.5 mm" }));
    expect(vertical).toHaveValue(3.5);
    css = container.querySelector("style[data-label-sheet-css]")?.textContent ?? "";
    expect(css).toContain('[data-slot="1"]{left:7.7mm;top:16mm}');
    const saved = JSON.parse(window.localStorage.getItem(labelDraftStorageKey("store-1")) ?? "{}");
    expect(saved.sheet).toMatchObject({ offsetYMm: 3.5 });
    // La calibración no abre el diálogo de impresión sola.
    expect(container.querySelectorAll(".label-sheet__slot")).toHaveLength(60);
  });

  it("«vista» shows the job at real size without opening the print dialog", async () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    window.localStorage.setItem(
      printJobStorageKey("store-1"),
      JSON.stringify({ storeId: "store-1", source: "product", labels: [{ id: "p1", code: "PDP:p1", title: "Agenda" }], templateId: "AH_ROYAL_65_CARTA", startAt: 1, sheet: DEFAULT_SHEET_OPTIONS, content: { showVariant: true, showSku: true, showPrice: false, showGroupName: false }, createdAt: "2026-09-19T00:00:00.000Z" }),
    );
    const { container } = render(<PrintLabelsClient storeId="store-1" mode="vista" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(container.textContent).toContain("Vista previa a tamaño real");
    expect(container.querySelectorAll("[data-label-id]")).toHaveLength(1);
    expect(print).not.toHaveBeenCalled();
    cleanup();
    // El modo normal sí lo abre solo: la diferencia es únicamente el modo.
    render(<PrintLabelsClient storeId="store-1" mode="etiquetas" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(print).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
