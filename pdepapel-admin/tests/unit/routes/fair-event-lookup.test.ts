import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStoreRead: vi.fn(),
  capsuleFindFirst: vi.fn(),
  itemFindFirst: vi.fn(),
  productFindFirst: vi.fn(),
  availability: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/store-access", () => ({ requireStoreRead: mocks.requireStoreRead }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    fairCapsule: { findFirst: mocks.capsuleFindFirst },
    fairEventInventoryItem: { findFirst: mocks.itemFindFirst },
    product: { findFirst: mocks.productFindFirst },
  },
}));
// La cuenta de unidades disponibles tiene sus propias pruebas; aquí se controla
// para poder recorrer cada final del buscador.
vi.mock("@/lib/fair-events", () => ({ getFairStockAvailability: mocks.availability }));

import { GET } from "@/app/api/[storeId]/fair-events/[fairEventId]/lookup/route";

const STORE = "store-1";
const FAIR = "fair-1";
const ID = "fc555542-87dc-45db-8c0c-54ff366b0a51";
const QR = `PDP:${ID}`;

const call = (code: string) =>
  GET(
    new NextRequestLike(`https://admin.test/api/${STORE}/fair-events/${FAIR}/lookup?code=${encodeURIComponent(code)}`) as never,
    { params: { storeId: STORE, fairEventId: FAIR } },
  );

/** `NextRequest` real pide entorno de Next; basta con `nextUrl`. */
class NextRequestLike {
  nextUrl: URL;
  constructor(url: string) {
    this.nextUrl = new URL(url);
  }
}

const producto = { id: ID, name: "Guillotina cortes circulares", sku: "GUI-GAT-AMA-M-L-9413", price: 25000, images: [] };
const texto = async (response: Response) => JSON.stringify(await response.json());

/**
 * Buscar por código en una feria. La etiqueta normal de un producto lleva
 * `PDP:<id>`; antes esta ruta pasaba TODO a mayúsculas y comparaba contra SKU
 * y GTIN, así que un id en minúsculas no casaba nunca y se contestaba «no hay
 * inventario disponible», culpando al stock de un código ilegible.
 */
describe("GET /fair-events/[id]/lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.requireStoreRead.mockResolvedValue({ userId: "owner", role: "owner" });
    mocks.capsuleFindFirst.mockResolvedValue(null);
    mocks.itemFindFirst.mockResolvedValue(null);
    mocks.productFindFirst.mockResolvedValue(null);
    mocks.availability.mockReturnValue(5);
  });

  describe("QR de etiqueta «PDP:<id>»", () => {
    it("resuelve un producto reservado y con unidades", async () => {
      mocks.itemFindFirst.mockResolvedValue({ product: producto });

      const response = await call(QR);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ kind: "product", product: { id: ID } });
      // El id va tal cual, en minúsculas, y sin soltar feria ni tienda.
      expect(mocks.itemFindFirst.mock.calls[0][0].where).toMatchObject({
        fairEventId: FAIR,
        fairEvent: { storeId: STORE },
        product: { id: ID },
      });
    });

    it("un QR de etiqueta no gasta la consulta de cápsulas", async () => {
      // Una cápsula siempre es «CAP-…», así que no puede ser un QR de etiqueta.
      mocks.itemFindFirst.mockResolvedValue({ product: producto });
      await call(QR);
      expect(mocks.capsuleFindFirst).not.toHaveBeenCalled();
    });

    it("existe en la tienda pero no está en esta feria: lo dice por su nombre", async () => {
      mocks.itemFindFirst.mockResolvedValue(null);
      mocks.productFindFirst.mockResolvedValue({ name: "Guillotina cortes circulares" });

      const response = await call(QR);

      expect(response.status).toBe(404);
      expect(await texto(response)).toContain("no está reservado para esta feria");
      // Y la pregunta por la tienda va acotada: no se mira el catálogo ajeno.
      expect(mocks.productFindFirst.mock.calls[0][0].where).toMatchObject({ storeId: STORE, id: ID });
    });

    it("reservado pero sin unidades: habla de unidades, no de código", async () => {
      mocks.itemFindFirst.mockResolvedValue({ product: producto });
      mocks.availability.mockReturnValue(0);

      const response = await call(QR);
      const cuerpo = await texto(response);

      expect(response.status).toBe(404);
      expect(cuerpo).toContain("ya no tiene unidades en esta feria");
      expect(cuerpo).not.toContain("No reconocemos");
    });

    it("un QR de un producto que no existe sí es un código no reconocido", async () => {
      mocks.itemFindFirst.mockResolvedValue(null);
      mocks.productFindFirst.mockResolvedValue(null);

      const response = await call("PDP:00000000-0000-0000-0000-000000000000");

      expect(response.status).toBe(404);
      expect(await texto(response)).toContain("No reconocemos");
    });

    /** Aislamiento: el producto es de otra tienda, así que aquí no aparece. */
    it("un QR de otra tienda no resuelve", async () => {
      mocks.itemFindFirst.mockResolvedValue(null);
      mocks.productFindFirst.mockResolvedValue(null);

      const response = await call(QR);

      expect(response.status).toBe(404);
      expect(mocks.itemFindFirst.mock.calls[0][0].where).toMatchObject({ fairEvent: { storeId: STORE } });
      expect(mocks.productFindFirst.mock.calls[0][0].where).toMatchObject({ storeId: STORE });
    });
  });

  describe("lo que ya funcionaba sigue igual", () => {
    it("el SKU se sigue comparando en mayúsculas", async () => {
      mocks.itemFindFirst.mockResolvedValue({ product: producto });

      await call("gui-gat-ama-m-l-9413");

      expect(mocks.itemFindFirst.mock.calls[0][0].where.product).toEqual({
        OR: [{ sku: "GUI-GAT-AMA-M-L-9413" }, { gtin: "GUI-GAT-AMA-M-L-9413" }],
      });
    });

    it("una cápsula empacada resuelve como cápsula", async () => {
      mocks.capsuleFindFirst.mockResolvedValue({
        code: "CAP-FAIR0001-ABCD1234",
        salePrice: 15000,
        product: { id: "p-9", name: "Sorpresa", sku: "SOR-1" },
      });

      const response = await call("cap-fair0001-abcd1234");

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ kind: "capsule", code: "CAP-FAIR0001-ABCD1234" });
      // Sin tocar el inventario de la feria: la cápsula manda.
      expect(mocks.itemFindFirst).not.toHaveBeenCalled();
    });

    it("un código de basura es un código no reconocido", async () => {
      const response = await call("ZZZ-404");

      expect(response.status).toBe(404);
      expect(await texto(response)).toContain("No reconocemos");
    });

    it("sin código, pide uno", async () => {
      const response = await call("");
      expect(response.status).toBe(400);
      expect(await texto(response)).toContain("Ingresa o escanea un código");
    });
  });
});
