import { describe, expect, it } from "vitest";

import { collectMovementActorIds, movementActor, normalizeMovementActor } from "@/lib/movement-actor";

/**
 * Producción trae la misma persona escrita de dos maneras: 2.158 filas con el
 * id de Clerk a secas y 1.040 con el prefijo `USER_`.
 */
describe("quién hizo el movimiento", () => {
  it("lee las dos formas históricas como la misma persona", () => {
    expect(normalizeMovementActor("user_2Yu").userId).toBe("user_2Yu");
    expect(normalizeMovementActor("USER_user_2Yu").userId).toBe("user_2Yu");
  });

  it("reconoce los actores automáticos y no los confunde con una persona", () => {
    for (const actor of ["SYSTEM", "SYSTEM_BOLD", "SYSTEM_WOMPI", "SYSTEM_MERCADOLIBRE", "SYSTEM_MIGRATION_SCRIPT"]) {
      expect(normalizeMovementActor(actor)).toEqual({ system: true, userId: null });
    }
  });

  it("sin actor no inventa una persona", () => {
    expect(normalizeMovementActor(null)).toEqual({ system: false, userId: null });
    expect(normalizeMovementActor("  ")).toEqual({ system: false, userId: null });
  });

  it("al escribir deja una sola forma: el id sin prefijo", () => {
    expect(movementActor("user_2Yu")).toBe("user_2Yu");
    expect(movementActor("USER_user_2Yu")).toBe("user_2Yu");
    expect(movementActor(null)).toBe("SYSTEM");
  });

  it("junta los ids a resolver sin repetir y sin los automáticos", () => {
    const ids = collectMovementActorIds([
      { createdBy: "user_a" },
      { createdBy: "USER_user_a" },
      { createdBy: "SYSTEM_BOLD" },
      { createdBy: null },
      { createdBy: "user_b" },
    ]);
    expect(Array.from(ids).sort()).toEqual(["user_a", "user_b"]);
  });
});
