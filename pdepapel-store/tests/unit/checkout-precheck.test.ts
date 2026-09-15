import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeStockPrecheck } from "@/lib/checkout-precheck";

describe("la revisión de stock nunca puede tumbar el envío", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("cuando funciona, devuelve el stock tal cual", async () => {
    const stock = { "p1": { units: 4 } };
    await expect(safeStockPrecheck(async () => stock)).resolves.toEqual({
      stock,
      failed: false,
    });
  });

  it("SERVER ACTION CADUCADA: no lanza; deja seguir el pedido", async () => {
    // El error literal de Next cuando entra un despliegue nuevo y la clienta
    // tenía el checkout abierto. Antes esto se escapaba de `onSubmit`,
    // react-hook-form se lo tragaba y ella se quedaba sin pedido y sin aviso.
    const caducada = async () => {
      throw new Error(
        "Failed to find Server Action \"abc123\". This request might be from an older or newer deployment.",
      );
    };
    await expect(safeStockPrecheck(caducada)).resolves.toEqual({
      stock: null,
      failed: true,
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("cualquier otro fallo tampoco lanza", async () => {
    for (const fallo of [
      new Error("Failed to fetch"),
      new TypeError("NetworkError when attempting to fetch resource."),
      "un string pelado",
    ]) {
      await expect(
        safeStockPrecheck(async () => {
          throw fallo;
        }),
      ).resolves.toMatchObject({ stock: null, failed: true });
    }
  });

  it("así se comportaba ANTES: el await pelado sí lanza", async () => {
    // Documenta el fallo, para saber que la prueba de arriba distingue.
    const caducada = async () => {
      throw new Error("Failed to find Server Action");
    };
    await expect(caducada()).rejects.toThrow("Failed to find Server Action");
  });
});
