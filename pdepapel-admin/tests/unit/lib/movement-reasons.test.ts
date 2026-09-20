import { describe, expect, it } from "vitest";

import { MANUAL_ADJUSTMENT_OPTIONS } from "@/lib/inventory-constants";
import {
  composeMovementReason,
  findMovementIntent,
  findMovementReason,
  MOVEMENT_INTENTS,
  resolveIntentSign,
} from "@/lib/movement-reasons";

/**
 * El motivo dejó de ser texto libre. Producción tenía 464 cadenas distintas
 * para 3.388 movimientos, con cuatro formas de decir «stock inicial» y mezcla
 * de español e inglés.
 */
describe("qué puede registrar una persona", () => {
  it("cada intención tiene etiqueta, pista, signo y al menos dos motivos", () => {
    expect(MOVEMENT_INTENTS.length).toBeGreaterThanOrEqual(6);
    for (const intent of MOVEMENT_INTENTS) {
      expect(intent.label.trim()).not.toBe("");
      expect(intent.hint.trim()).not.toBe("");
      expect(["add", "subtract", "both"]).toContain(intent.sign);
      expect(intent.reasons.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("no repite un tipo ni un id de motivo dentro de una intención", () => {
    const ids = MOVEMENT_INTENTS.map((intent) => intent.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const intent of MOVEMENT_INTENTS) {
      const reasonIds = intent.reasons.map((reason) => reason.id);
      expect(new Set(reasonIds).size).toBe(reasonIds.length);
    }
  });

  it("solo ofrece tipos que la API acepta para un movimiento a mano", () => {
    const allowed = new Set(MANUAL_ADJUSTMENT_OPTIONS.map((option) => option.value));
    for (const intent of MOVEMENT_INTENTS) {
      expect(allowed.has(intent.id)).toBe(true);
    }
  });

  it("el signo lo impone la intención, salvo el conteo físico", () => {
    const count = findMovementIntent("MANUAL_ADJUSTMENT")!;
    expect(count.sign).toBe("both");
    expect(resolveIntentSign(count, "subtract")).toBe("subtract");
    expect(resolveIntentSign(count, "add")).toBe("add");

    const damage = findMovementIntent("DAMAGE")!;
    expect(damage.sign).toBe("subtract");
    // Aunque la interfaz pidiera sumar, un daño resta.
    expect(resolveIntentSign(damage, "add")).toBe("subtract");
  });

  it("el cuadre del kardex tiene su propio motivo", () => {
    expect(findMovementReason("MANUAL_ADJUSTMENT", "cuadre-kardex")?.label).toBe("Cuadre del kardex");
  });

  it("guarda el texto, no el id: el kardex lo lee una persona", () => {
    expect(composeMovementReason("DAMAGE", "roto-bodega")).toBe("Daño · Se dañó en la bodega");
    expect(composeMovementReason("MANUAL_ADJUSTMENT", "cuadre-kardex")).toBe("Conteo físico · Cuadre del kardex");
  });

  it("una combinación inventada no produce motivo", () => {
    expect(composeMovementReason("DAMAGE", "no-existe")).toBeNull();
    expect(composeMovementReason("NO_EXISTE", "roto-bodega")).toBeNull();
  });
});
