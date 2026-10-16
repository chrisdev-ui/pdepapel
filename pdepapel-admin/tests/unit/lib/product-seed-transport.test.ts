import { beforeEach, describe, expect, it, vi } from "vitest";

/** «Duplicar» no copia el envío por unidad: es de cada compra, y el original puede traer el 1.000 del relleno. */
const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: { product: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/store-access", () => ({ requireStoreRead: vi.fn().mockResolvedValue({ role: "owner" }) }));

import { getProductSeed } from "@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/server/get-product";

const source = {
  id: "p1",
  name: "Sobre Prueba",
  description: "",
  price: 480,
  acqPrice: 160,
  transportationCost: 1000,
  categoryId: "c1",
  colorId: "co1",
  sizeId: "s1",
  designId: "d1",
  supplierId: "sup1",
  brand: null,
  isKit: false,
  kitComponents: [],
  catalogOptionValues: [],
};

describe("duplicar un producto", () => {
  beforeEach(() => mocks.findFirst.mockReset());

  it("copia costo de compra y precio, pero el envío por unidad nace «no registrado»", async () => {
    for (const transportationCost of [1000, 350, null]) {
      mocks.findFirst.mockResolvedValue({ ...source, transportationCost });
      const seed = await getProductSeed("store-1", "p1");
      expect(seed).toMatchObject({ name: "Sobre Prueba (copia)", acqPrice: 160, price: 480, transportationCost: null });
    }
  });
});
