import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({
  beautifulEveryTime: { variable: "" },
  caudex: { variable: "" },
  fredoka: { variable: "" },
  quicksand: { variable: "" },
}));

import { metadata as rootMetadata } from "@/app/layout";
import { metadata as receiptMetadata } from "@/app/(routes)/pedido/layout";
import { ORDER_RECEIPT_HEADERS, ORDER_RECEIPT_HEADER_SOURCE, ORDER_RECEIPT_REFERRER_POLICY } from "@/lib/receipt-headers.mjs";

/**
 * El recibo queda fuera de los buscadores y su ruta (con el id) no sale en el
 * referrer; el resto de la tienda conserva la política de siempre.
 */
describe("cabeceras y referrer del recibo", () => {
  it("/pedido/* lleva noindex, nofollow y Referrer-Policy strict-origin", () => {
    expect(ORDER_RECEIPT_HEADER_SOURCE).toBe("/pedido/:path*");
    expect(ORDER_RECEIPT_HEADERS).toEqual([
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "strict-origin" },
    ]);
  });

  it("next.config las aplica solo a /pedido/*", () => {
    const config = readFileSync(new URL("../../../next.config.mjs", import.meta.url), "utf8");
    expect(config).toContain('import { ORDER_RECEIPT_HEADERS, ORDER_RECEIPT_HEADER_SOURCE } from "./lib/receipt-headers.mjs";');
    expect(config).toContain("{ source: ORDER_RECEIPT_HEADER_SOURCE, headers: ORDER_RECEIPT_HEADERS }");
    expect(config.match(/Referrer-Policy|X-Robots-Tag/g) ?? []).toHaveLength(0);
  });

  it("la meta referrer del recibo no deja que la de la raíz pise la cabecera; la raíz sigue igual", () => {
    expect(receiptMetadata.referrer).toBe(ORDER_RECEIPT_REFERRER_POLICY);
    expect(rootMetadata.referrer).toBe("origin-when-cross-origin");
  });

  it("la página del recibo no fija otra política que le gane al layout", () => {
    const page = readFileSync(new URL("../../../app/(routes)/pedido/[orderId]/page.tsx", import.meta.url), "utf8");
    expect(page).not.toMatch(/referrer\s*:/);
  });
});
