import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStoreRead: vi.fn(),
  auth: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  prices: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
// Las lecturas abiertas a cuentas de solo lectura pasan por este ayudante.
vi.mock("@/lib/store-access", () => ({
  requireStoreRead: mocks.requireStoreRead,
}));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: { product: { findFirst: mocks.findFirst, findMany: mocks.findMany } } }));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({ get: mocks.redisGet, set: mocks.redisSet }) } }));
vi.mock("@/lib/discount-engine", () => ({ getProductsPrices: mocks.prices }));

import { GET } from "@/app/api/[storeId]/products/search/route";

const call = (params: string) => GET(new Request(`https://admin.test/api/store-1/products/search?${params}`), { params: { storeId: "store-1" } });
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, sku: id.toUpperCase(), gtin: null, stock: 2, price: 10000, soldCount: 0, categoryId: "c", productGroupId: null, isKit: false, images: [], kitComponents: [], ...extra });

/** Vender: `mode=venta` ordena para el mostrador y trae el precio con oferta. */
describe("GET /products/search?mode=venta", () => {
  beforeEach(() => {
    mocks.requireStoreRead.mockResolvedValue({ userId: "owner", role: "owner" });
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.prices.mockImplementation(async (products: { id: string; price: number }[]) => new Map(products.map((p) => [p.id, { price: p.id === "oferta" ? 8000 : p.price, originalPrice: p.price, discount: 0, offerLabel: p.id === "oferta" ? "20% OFF" : null, matchedOfferId: null }])));
  });

  it("puts the exact code first, sold-out last, and carries the offer price", async () => {
    mocks.findFirst.mockResolvedValue(row("codigo", { sku: "LIB-1", soldCount: 0 }));
    mocks.findMany.mockResolvedValue([row("agotado", { name: "Lib agotada", stock: 0, soldCount: 900 }), row("oferta", { name: "Lib oferta", soldCount: 3 }), row("codigo", { sku: "LIB-1" })]);
    const response = await call("mode=venta&q=LIB-1&limit=30");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.map((item: { id: string }) => item.id)).toEqual(["codigo", "oferta", "agotado"]);
    expect(body.data[0]).toMatchObject({ match: "codigo", available: true });
    expect(body.data[1]).toMatchObject({ offerPrice: 8000, offerLabel: "20% OFF", price: 10000 });
    expect(body.data[2]).toMatchObject({ available: false });
    expect(body.metadata).toEqual({ hasMore: false, nextPage: null, total: 3, truncated: false });
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({ storeId: "store-1", isArchived: false, OR: [{ sku: "LIB-1" }, { gtin: "LIB-1" }] });
    expect(mocks.redisSet.mock.calls[0][0]).toBe("store:store-1:admin-select:venta:lib-1:1");
  });

  /**
   * El QR de la etiqueta lleva `PDP:<id>`, no el SKU. Antes la rama exacta solo
   * miraba SKU y GTIN, así que escanear en Vender no encontraba nada nunca
   * —ningún producto tiene un SKU que empiece por `PDP:`— y Paula veía «no
   * coincide con ningún producto a la venta» con el producto activo delante.
   */
  describe("QR de etiqueta «PDP:<id>»", () => {
    const QR = "PDP:fc555542-87dc-45db-8c0c-54ff366b0a51";
    const ID = "fc555542-87dc-45db-8c0c-54ff366b0a51";

    it("resuelve el producto por id, igual que si se hubiera escaneado su SKU", async () => {
      mocks.findFirst.mockResolvedValue(row(ID, { name: "Guillotina cortes circulares", sku: "GUI-GAT-AMA-M-L-9413", stock: 3 }));
      mocks.findMany.mockResolvedValue([]);

      const body = await (await call(`mode=venta&q=${encodeURIComponent(QR)}&limit=30`)).json();

      // La rama exacta añade el id SIN soltar el acotado por tienda ni el de
      // archivados: una etiqueta de otra tienda no puede resolver aquí.
      expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({
        storeId: "store-1",
        isArchived: false,
        OR: [{ id: ID }, { sku: QR }, { gtin: QR }],
      });
      expect(body.data[0]).toMatchObject({ id: ID, match: "codigo", available: true });
    });

    it("un producto archivado no resuelve: el filtro de siempre sigue puesto", async () => {
      // `isArchived: false` va en el where, así que Prisma no lo devuelve.
      mocks.findFirst.mockResolvedValue(null);
      mocks.findMany.mockResolvedValue([]);

      const body = await (await call(`mode=venta&q=${encodeURIComponent(QR)}&limit=30`)).json();

      expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({ isArchived: false });
      expect(body.data).toEqual([]);
    });

    it("un agotado sí resuelve, y llega marcado como no disponible", async () => {
      // No es «no encontrado»: la pantalla lo enseña y avisa que no hay unidades.
      mocks.findFirst.mockResolvedValue(row(ID, { name: "Guillotina", sku: "GUI-1", stock: 0 }));
      mocks.findMany.mockResolvedValue([]);

      const body = await (await call(`mode=venta&q=${encodeURIComponent(QR)}&limit=30`)).json();

      expect(body.data[0]).toMatchObject({ id: ID, available: false, stock: 0 });
    });

    it("un «PDP:» mal formado sigue el camino de siempre, sin romper nada", async () => {
      mocks.findFirst.mockResolvedValue(null);
      mocks.findMany.mockResolvedValue([]);

      // El patrón pide [a-z0-9-]; un espacio no encaja, así que no es un id.
      const response = await call(`mode=venta&q=${encodeURIComponent("PDP: no es un id")}&limit=30`);

      expect(response.status).toBe(200);
      const where = mocks.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ sku: "PDP: no es un id" }, { gtin: "PDP: no es un id" }]);
      expect((await response.json()).data).toEqual([]);
    });

    it("sin QR, la rama exacta queda exactamente como estaba", async () => {
      mocks.findFirst.mockResolvedValue(row("codigo", { sku: "LIB-1" }));
      mocks.findMany.mockResolvedValue([]);

      await call("mode=venta&q=LIB-1&limit=30");

      expect(mocks.findFirst.mock.calls[0][0].where.OR).toEqual([{ sku: "LIB-1" }, { gtin: "LIB-1" }]);
    });
  });

  it("returns best-sellers with units for the empty query (preloaded first page)", async () => {
    mocks.findMany.mockResolvedValue([row("b", { soldCount: 5 }), row("a", { soldCount: 20 })]);
    const response = await call("mode=venta&q=&limit=30");
    const body = await response.json();
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({ where: { storeId: "store-1", isArchived: false, stock: { gt: 0 } }, orderBy: [{ soldCount: "desc" }, { name: "asc" }] });
    expect(body.data.map((item: { id: string }) => item.id)).toEqual(["a", "b"]);
  });

  it("keeps the classic mode untouched for the other pickers", async () => {
    mocks.findMany.mockResolvedValue([row("x")]);
    const response = await call("q=x&limit=20");
    const body = await response.json();
    expect(body.metadata).toEqual({ hasMore: false, nextPage: null });
    expect(mocks.prices).not.toHaveBeenCalled();
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({ orderBy: { updatedAt: "desc" } });
  });
});
