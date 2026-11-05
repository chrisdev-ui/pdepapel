import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CAPSULAS_SORPRESA_ID } from "@/constants";
import {
  CAPSULE_PRIZE_LINES_WARNING,
  CapsulePrizeLinesNotice,
  hasCapsuleComboWithOtherLines,
  isCapsuleComboCategory,
} from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/capsule-prize-lines";
import { ORDER_TYPE_PRESETS } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/schema";

describe("aviso de premios de cápsulas como productos del pedido", () => {
  const combos = new Set(["combo-x7"]);

  it("avisa con un combo de «Kits sorpresa» y cualquier otra línea, del catálogo o manual", () => {
    expect(hasCapsuleComboWithOtherLines([{ productId: "combo-x7" }, { productId: "reto-de-lectura" }], combos)).toBe(true);
    expect(hasCapsuleComboWithOtherLines([{ productId: "combo-x7" }, { productId: null }], combos)).toBe(true);
  });

  it("no avisa con solo el combo, sin combo o sin líneas", () => {
    expect(hasCapsuleComboWithOtherLines([{ productId: "combo-x7" }], combos)).toBe(false);
    expect(hasCapsuleComboWithOtherLines([{ productId: "combo-x7" }, { productId: "combo-x7" }], combos)).toBe(false);
    expect(hasCapsuleComboWithOtherLines([{ productId: "reto-de-lectura" }, { productId: "marcadores" }], combos)).toBe(false);
    expect(hasCapsuleComboWithOtherLines([], combos)).toBe(false);
  });

  it("un combo es un producto de la categoría «Kits sorpresa»", () => {
    expect(isCapsuleComboCategory(CAPSULAS_SORPRESA_ID)).toBe(true);
    expect(isCapsuleComboCategory("otra-categoria")).toBe(false);
    expect(isCapsuleComboCategory(null)).toBe(false);
    expect(isCapsuleComboCategory(undefined)).toBe(false);
  });

  it("es una nota en línea (role=status) con el texto acordado, no un toast ni un bloqueo", () => {
    const html = renderToStaticMarkup(<CapsulePrizeLinesNotice />);
    expect(html).toContain('role="status"');
    expect(html).toContain(CAPSULE_PRIZE_LINES_WARNING);
    expect(CAPSULE_PRIZE_LINES_WARNING).toBe(
      "Los premios de las cápsulas no van como productos del pedido: la clienta los vería en el correo y en el recibo. Si son premios, quítalos y mándalos en la lista para registrarlos aparte.",
    );
  });
});

describe("notas del pedido (adminNotes): no las ve la clienta", () => {
  it("el pedido de tienda dice lo que pasa de verdad", () => {
    expect(ORDER_TYPE_PRESETS.STANDARD.notesLabel).toBe("Notas del pedido (no las ve la clienta)");
    expect(ORDER_TYPE_PRESETS.STANDARD.notesHint).toBe("Solo se ven en el panel.");
  });

  it("ningún tipo de pedido promete que la clienta ve esas notas", () => {
    for (const preset of Object.values(ORDER_TYPE_PRESETS)) {
      expect(`${preset.notesLabel} ${preset.notesHint}`, preset.type).not.toMatch(/para el cliente|el cliente la ve|la clienta la ve|se muestran en la página del pedido/i);
    }
  });
});
