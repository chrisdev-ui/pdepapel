import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertNoForbiddenKeys } from "../../helpers/forbidden-keys";

/** «Duplicar» es crear: solo la dueña. La copia traía costo, proveedor y piezas del kit con sus costos. */
const mocks = vi.hoisted(() => ({ role: "owner" as "owner" | "viewer", findFirst: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: { product: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/store-access", () => ({ requireStoreRead: async () => ({ role: mocks.role }) }));

import { getProductSeed } from "@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/server/get-product";

const source = {
  id: "kit-1",
  name: "Kit escolar",
  description: "",
  price: 30000,
  acqPrice: 12000,
  transportationCost: null,
  categoryId: "c1",
  colorId: "co1",
  sizeId: "s1",
  designId: "d1",
  supplierId: "sup1",
  brandId: null,
  brandRef: null,
  isKit: true,
  kitComponents: [{ quantity: 2, component: { id: "p2", name: "Lápiz", acqPrice: 800, transportationCost: 100, supplierId: "sup1", soldCount: 40 } }],
  catalogOptionValues: [],
};

describe("getProductSeed («Duplicar»)", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset().mockResolvedValue(source);
    mocks.role = "owner";
  });

  it("la cuenta de solo lectura recibe 403 y no se lee nada", async () => {
    mocks.role = "viewer";
    const outcome = await getProductSeed("store-1", "kit-1").then(
      (seed) => ({ ok: true as const, seed }),
      (error: { statusCode?: number; status?: number }) => ({ ok: false as const, status: error.statusCode ?? error.status }),
    );
    if (outcome.ok) assertNoForbiddenKeys(outcome.seed, "viewer");
    expect(outcome).toEqual({ ok: false, status: 403 });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("la dueña sigue duplicando con el costo", async () => {
    expect(await getProductSeed("store-1", "kit-1")).toMatchObject({ name: "Kit escolar (copia)", acqPrice: 12000 });
  });
});
