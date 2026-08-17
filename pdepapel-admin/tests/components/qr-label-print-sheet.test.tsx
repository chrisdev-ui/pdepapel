// @vitest-environment jsdom

import {
  printQrLabelSheet,
  QrLabelPrintSheet,
  type QrPrintLabel,
} from "@/components/labels/qr-label-print-sheet";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const labels: QrPrintLabel[] = Array.from({ length: 66 }, (_, index) => ({
  id: `product-${index + 1}`,
  code: `PDP:product-${index + 1}`,
  title: `Producto ${index + 1}`,
  subtitle: `SKU-${index + 1}`,
}));

describe("QrLabelPrintSheet", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("splits compact labels into A4-sized pages", () => {
    const { container } = render(
      <QrLabelPrintSheet
        target="product"
        labels={labels}
        format="COMPACT_65"
      />,
    );

    expect(container.querySelectorAll(".print-label-page")).toHaveLength(2);
    expect(
      container.querySelectorAll(".print-label-page")[0].querySelectorAll(
        ".qr-print-label",
      ),
    ).toHaveLength(65);
    expect(
      container.querySelectorAll(".print-label-page")[1].querySelectorAll(
        ".qr-print-label",
      ),
    ).toHaveLength(1);
  });

  it("prints an isolated A4 document instead of the dashboard", () => {
    vi.useFakeTimers();
    const printDocument = document.implementation.createHTMLDocument();
    Object.defineProperty(printDocument, "readyState", {
      configurable: true,
      value: "complete",
    });
    const print = vi.fn();
    const popup = {
      document: printDocument,
      focus: vi.fn(),
      print,
      close: vi.fn(),
      addEventListener: vi.fn(),
    } as unknown as Window;
    const write = vi.spyOn(printDocument, "write");
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(
      <QrLabelPrintSheet
        target="product"
        labels={labels.slice(0, 1)}
        format="STANDARD_40"
      />,
    );

    expect(printQrLabelSheet("product")).toBe(true);
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining("@page"),
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('data-qr-label-sheet="product"'),
    );

    vi.runAllTimers();
    expect(print).toHaveBeenCalledOnce();
  });
});
