import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { maskEmail, maskPersonName, maskPhone } from "@/lib/public-orders";

import { MASKED_RECEIPT_SHAPE } from "../../fixtures/masked-receipt-shape";

describe("recorte de datos del recibo para quien solo tiene el enlace", () => {
  it.each([
    ["Ana María Prueba", "Ana P."],
    ["  Ana   Prueba ", "Ana P."],
    ["lucía ñandú", "lucía Ñ."],
    ["Ana", "Ana"],
    ["", ""],
    [null, ""],
  ])("nombre %j → %j", (input, expected) => {
    expect(maskPersonName(input)).toBe(expected);
    if (expected) expect(expected).toMatch(MASKED_RECEIPT_SHAPE.patterns.fullName);
  });

  it.each([
    ["+57 300 000 0000", "•••• 0000"],
    ["3001234567", "•••• 4567"],
    ["12", "••••"],
    [null, "••••"],
  ])("teléfono %j → %j", (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });

  it.each([
    ["ana@prueba.test", "a***@prueba.test"],
    ["a@b.co", "a***@b.co"],
    ["x@y@dominio.test", "x***@dominio.test"],
    ["sin-arroba", ""],
    ["@dominio.test", ""],
    [null, ""],
  ])("correo %j → %j", (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
    if (expected) expect(expected).toMatch(MASKED_RECEIPT_SHAPE.patterns.email);
  });

  it("la copia de la forma sigue al fixture de la tienda (mismos campos quitados)", () => {
    const store = readFileSync(path.resolve(__dirname, "../../../../pdepapel-store/tests/fixtures/receipt-orders.ts"), "utf8");
    const block = store.slice(store.indexOf("export const maskedReceiptOrder"));
    const removed = Array.from(block.matchAll(/^\s+(\w+): _\w+,$/gm), (match) => match[1]);
    expect(removed.sort()).toEqual([...MASKED_RECEIPT_SHAPE.removed].sort());
    expect(block).toContain('payment: { id: "pay-1", method: "Bold" }');
    expect(block).toContain("masked: true");
  });
});
