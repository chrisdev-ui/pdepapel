import {
  getLabelPrintFormat,
  LABEL_PRINT_FORMATS,
} from "@/lib/label-printing";
import { describe, expect, it } from "vitest";

describe("label printing formats", () => {
  it("keeps the compact format aligned to 65 labels per A4 page", () => {
    expect(LABEL_PRINT_FORMATS.COMPACT_65).toMatchObject({
      itemsPerPage: 65,
      widthMm: 38.1,
      heightMm: 21.2,
      qrSizeMm: 18,
    });
  });

  it("keeps the standard format large enough for capsule QR codes", () => {
    expect(getLabelPrintFormat("STANDARD_40")).toMatchObject({
      itemsPerPage: 40,
      widthMm: 48,
      heightMm: 28,
      qrSizeMm: 22,
    });
  });
});
