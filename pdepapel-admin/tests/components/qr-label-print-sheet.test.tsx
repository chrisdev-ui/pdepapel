// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CONTENT_OPTIONS,
  labelPrintUrl,
  openLabelPrintJob,
  printJobStorageKey,
  QrLabelPrintSheet,
  readLabelPrintJob,
  type QrPrintLabel,
} from "@/components/labels/qr-label-print-sheet";
import { DEFAULT_SHEET_OPTIONS } from "@/lib/label-printing";

const labels: QrPrintLabel[] = Array.from({ length: 66 }, (_, index) => ({
  id: `product-${index + 1}`,
  code: `PDP:product-${index + 1}`,
  title: `Producto ${index + 1}`,
  variant: index % 2 === 0 ? "Rosa pastel · S" : null,
  sku: `CAR-AES-ROS-S-L-${1000 + index}`,
  price: 13000,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("QrLabelPrintSheet", () => {
  it("splits labels into Letter sheets of 65 and keeps empty slots in place", () => {
    const { container } = render(<QrLabelPrintSheet labels={labels} />);
    const sheets = container.querySelectorAll(".label-sheet");
    expect(sheets).toHaveLength(2);
    expect(sheets[0].querySelectorAll(".label-sheet__slot")).toHaveLength(65);
    expect(sheets[0].querySelectorAll("[data-label-id]")).toHaveLength(65);
    expect(sheets[1].querySelectorAll("[data-label-id]")).toHaveLength(1);
    expect(sheets[1].querySelectorAll(".label-sheet__slot--empty")).toHaveLength(64);
  });

  it("starts at the requested position so a half-used sheet can be reused", () => {
    const { container } = render(<QrLabelPrintSheet labels={labels.slice(0, 2)} startAt={5} />);
    const slots = container.querySelectorAll(".label-sheet__slot");
    expect(slots[3].classList.contains("label-sheet__slot--empty")).toBe(true);
    expect(slots[4].getAttribute("data-label-id")).toBe("product-1");
  });

  /**
   * El solape del panel: un QR de 128 px dentro de una caja de 80 px. Ahora el
   * SVG llena su caja y la caja sale de la geometría en mm, nunca de píxeles.
   */
  it("renders the QR to fill its box, with level M, instead of a fixed pixel size", () => {
    const { container } = render(<QrLabelPrintSheet labels={labels.slice(0, 1)} />);
    const svg = container.querySelector(".label-sheet__qr svg") as SVGElement;
    expect(svg).not.toBeNull();
    expect(svg.style.width).toBe("100%");
    expect(svg.style.height).toBe("100%");
    const css = container.querySelector("style[data-label-sheet-css]")?.textContent ?? "";
    expect(css).toContain(".label-sheet__qr{position:absolute;left:1mm");
    expect(css).toContain("width:17mm;height:17mm");
    expect(css).not.toMatch(/label-sheet__qr\{[^}]*px/);
  });

  it("prints the variant on its own line and never truncates the SKU", () => {
    const { container } = render(
      <QrLabelPrintSheet
        labels={[{ ...labels[0], sku: "COS-HAN-AZU-U-L-8370-EXTRA" }]}
        content={{ ...DEFAULT_CONTENT_OPTIONS, showPrice: true }}
      />,
    );
    expect(container.querySelector(".label-sheet__variant")?.textContent).toBe("Rosa pastel · S");
    const sku = container.querySelector(".label-sheet__sku") as HTMLElement;
    expect(sku.textContent).toBe("COS-HAN-AZU-U-L-8370-EXTRA");
    // Largo: baja de tamaño en vez de recortarse.
    expect(sku.classList.contains("label-sheet__sku--long")).toBe(true);
    expect(container.querySelector(".label-sheet__price")?.textContent).toContain("13.000");
    const css = container.querySelector("style[data-label-sheet-css]")?.textContent ?? "";
    expect(css).toMatch(/\.label-sheet__sku\{[^}]*overflow:visible/);
    expect(css).not.toMatch(/\.label-sheet__sku\{[^}]*ellipsis/);
  });

  it("hides variant, SKU and price when the content options say so", () => {
    const { container } = render(
      <QrLabelPrintSheet
        labels={labels.slice(0, 1)}
        content={{ showVariant: false, showSku: false, showPrice: false }}
      />,
    );
    expect(container.querySelector(".label-sheet__variant")).toBeNull();
    expect(container.querySelector(".label-sheet__sku")).toBeNull();
    expect(container.querySelector(".label-sheet__price")).toBeNull();
  });
});

describe("print job handoff", () => {
  it("stores the job for the print page and opens it in a new tab, no popup document", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const job = {
      storeId: "store-1",
      source: "product" as const,
      labels: labels.slice(0, 2),
      templateId: "AH_ROYAL_65_CARTA" as const,
      startAt: 3,
      sheet: DEFAULT_SHEET_OPTIONS,
      content: DEFAULT_CONTENT_OPTIONS,
      createdAt: "2026-09-19T00:00:00.000Z",
    };
    expect(openLabelPrintJob(job)).toBe(true);
    expect(open).toHaveBeenCalledWith(labelPrintUrl("store-1"), "_blank", "noopener");
    expect(window.localStorage.getItem(printJobStorageKey("store-1"))).toContain('"startAt":3');
    expect(readLabelPrintJob("store-1")).toMatchObject({ startAt: 3, source: "product", labels: job.labels });
  });

  it("falls back to navigating in place when the browser blocks the new tab", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
    openLabelPrintJob({
      storeId: "store-2",
      source: "capsule",
      labels: labels.slice(0, 1),
      templateId: "AH_ROYAL_65_CARTA",
      startAt: 1,
      sheet: DEFAULT_SHEET_OPTIONS,
      content: DEFAULT_CONTENT_OPTIONS,
      createdAt: "2026-09-19T00:00:00.000Z",
    });
    expect(assign).toHaveBeenCalledWith(labelPrintUrl("store-2"));
  });

  it("returns null for a missing or broken job", () => {
    expect(readLabelPrintJob("nadie")).toBeNull();
    window.localStorage.setItem(printJobStorageKey("roto"), "{no es json");
    expect(readLabelPrintJob("roto")).toBeNull();
  });
});
