import { describe, expect, it } from "vitest";

import { getProductAvailability } from "@/lib/product-availability";

const base = { stock: 0, isArchived: false, availableAt: null, isGroup: false };
const presale = (overrides: Record<string, unknown> = {}) => ({
  id: "presale-1",
  expectedArrivalAt: "2026-10-15T05:00:00.000Z",
  unitLimit: 40,
  committedUnits: 28,
  ...overrides,
});

describe("preventa en la ficha de producto", () => {
  it("se puede comprar sin stock, porque eso es una preventa", () => {
    const result = getProductAvailability({ ...base, presales: [presale()] } as never);

    expect(result).toMatchObject({
      status: "presale",
      canBuy: true,
      ctaLabel: "Reservar ahora",
      tone: "blue",
    });
    expect(result.presale).toMatchObject({ remaining: 12 });
  });

  it("deja de venderse cuando se llena el cupo", () => {
    const result = getProductAvailability({
      ...base,
      presales: [presale({ committedUnits: 40 })],
    } as never);

    expect(result).toMatchObject({ status: "coming-soon", canBuy: false });
    expect(result.stockLabel).toContain("Reservas agotadas");
  });

  it("gana sobre «llega pronto»: la preventa ES la forma de comprarlo antes", () => {
    const result = getProductAvailability({
      ...base,
      availableAt: "2099-01-01T00:00:00.000Z",
      presales: [presale()],
    } as never);

    expect(result.canBuy).toBe(true);
    expect(result.status).toBe("presale");
  });

  it("un producto archivado no se vende ni en preventa", () => {
    const result = getProductAvailability({
      ...base,
      isArchived: true,
      presales: [presale()],
    } as never);

    expect(result).toMatchObject({ status: "archived", canBuy: false });
  });

  it("sin preventa, todo sigue exactamente igual que antes", () => {
    expect(getProductAvailability({ ...base, stock: 5 } as never)).toMatchObject({
      status: "in-stock",
      canBuy: true,
    });
    expect(getProductAvailability({ ...base, stock: 0 } as never)).toMatchObject({
      status: "sold-out",
      canBuy: false,
    });
  });
});
