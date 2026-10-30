import {
  MarketplaceConnectionStatus,
  MarketplaceListingStatus,
  MarketplaceOutboxAction,
  MarketplaceProvider,
  OrderSource,
  OrderStatus,
  OrderType,
  ProductPresaleStatus,
} from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: session.userId }) }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), storefrontScopeOf: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));

import { isBlockedByPresaleForMercadoLibre, loadMercadoLibrePresaleBlocked, loadMercadoLibreSellable } from "@/lib/mercadolibre/available-quantity";
import { PRESALE_BLOCKS_MARKETPLACE_MESSAGE } from "@/lib/presale";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Regla del proyecto: las preventas quedan fuera de Mercado Libre. Con una
 * preventa activa (o una línea de preventa sin liberar en un pedido vivo) el
 * producto no se publica y su publicación ofrece 0, también la de los kits que
 * lo llevan; al cancelarse o liberarse vuelve a ofrecer lo vendible.
 */
let f: InventoryFixture;
let connectionId = "";
let componentListingId = "";
let kitListingId = "";

const request = (body: unknown) =>
  new Request("https://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const queuedTarget = async (listingId: string) => {
  const event = await testPrisma.marketplaceOutboxEvent.findFirst({ where: { listingId, action: MarketplaceOutboxAction.SYNC_STOCK } });
  return (event?.payload as { targetQuantity?: number } | null)?.targetQuantity;
};

beforeAll(async () => {
  await testPrisma.$connect();
  f = await createInventoryFixture();
  session.userId = f.store.userId;
  await testPrisma.product.update({ where: { id: f.component.id }, data: { stock: 6, reservedUnits: 1 } });
  connectionId = (
    await testPrisma.marketplaceConnection.create({
      data: { storeId: f.store.id, provider: MarketplaceProvider.MERCADOLIBRE, status: MarketplaceConnectionStatus.CONNECTED, sellerId: `seller-${randomBytes(4).toString("hex")}` },
    })
  ).id;
  const listing = (productId: string) =>
    testPrisma.marketplaceListing.create({
      data: { connectionId, productId, status: MarketplaceListingStatus.ACTIVE, externalItemId: `MCO${randomBytes(4).readUInt32BE()}`, marketplacePrice: 30000, stockSafetyBuffer: 1, syncStock: true },
    });
  componentListingId = (await listing(f.component.id)).id;
  kitListingId = (await listing(f.kit.id)).id;
});

afterAll(async () => {
  await testPrisma.productPresale.deleteMany({ where: { storeId: f.store.id } });
  await deleteInventoryFixture(f);
  await testPrisma.$disconnect();
});

describe("Mercado Libre sin preventas", () => {
  it("abrir una preventa baja a 0 la publicación del producto y la del kit que lo lleva", async () => {
    const { POST } = await import("@/app/api/[storeId]/presales/route");
    const response = await POST(request({ productId: f.component.id, unitLimit: 10 }), { params: { storeId: f.store.id } });
    expect(response.status).toBe(200);

    expect(await queuedTarget(componentListingId)).toBe(0);
    expect(await queuedTarget(kitListingId)).toBe(0);
    const sellable = await loadMercadoLibreSellable(testPrisma, [f.component.id, f.kit.id]);
    expect(sellable.get(f.component.id)).toBe(0);
    expect(sellable.get(f.kit.id)).toBe(0);
    await expect(isBlockedByPresaleForMercadoLibre(f.kit.id, testPrisma)).resolves.toBe(true);
  });

  it("no deja crear una publicación nueva mientras la preventa está abierta", async () => {
    await testPrisma.marketplaceListing.delete({ where: { id: kitListingId } });
    const { POST } = await import("@/app/api/[storeId]/marketplaces/mercadolibre/listings/route");
    const response = await POST(request({ productId: f.kit.id }), { params: { storeId: f.store.id } });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: PRESALE_BLOCKS_MARKETPLACE_MESSAGE });
    await expect(testPrisma.marketplaceListing.count({ where: { connectionId, productId: f.kit.id } })).resolves.toBe(0);
  });

  it("la conciliación cuenta igual: preventa activa = 0", async () => {
    const blocked = await loadMercadoLibrePresaleBlocked(testPrisma, [f.component.id]);
    expect(blocked.has(f.component.id)).toBe(true);
  });

  it("al cancelar la preventa vuelve a ofrecer stock − apartados − colchón", async () => {
    const presale = await testPrisma.productPresale.findFirstOrThrow({ where: { productId: f.component.id, status: ProductPresaleStatus.ACTIVE } });
    const { POST } = await import("@/app/api/[storeId]/presales/[presaleId]/cancel/route");
    const response = await POST(request({}), { params: { storeId: f.store.id, presaleId: presale.id } });
    expect(response.status).toBe(200);
    // 6 en stock − 1 apartado − colchón de 1.
    expect(await queuedTarget(componentListingId)).toBe(4);
    await expect(isBlockedByPresaleForMercadoLibre(f.component.id, testPrisma)).resolves.toBe(false);
  });

  it("una línea de preventa sin liberar en un pedido vivo sigue dejando el producto fuera", async () => {
    const order = await testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-ML-${randomUUID().slice(0, 8)}`,
        status: OrderStatus.PENDING,
        type: OrderType.STANDARD,
        source: OrderSource.STORE,
        fullName: "Clienta",
        phone: "+573001112233",
        address: "Calle 1",
        subtotal: 30000,
        total: 30000,
        orderItems: { create: [{ productId: f.component.id, name: "Componente", quantity: 1, price: 30000, isPreorder: true }] },
      },
      include: { orderItems: true },
    });
    await expect(isBlockedByPresaleForMercadoLibre(f.component.id, testPrisma)).resolves.toBe(true);
    await expect(isBlockedByPresaleForMercadoLibre(f.kit.id, testPrisma)).resolves.toBe(true);

    await testPrisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED } });
    await expect(isBlockedByPresaleForMercadoLibre(f.component.id, testPrisma)).resolves.toBe(false);

    await testPrisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });
    await testPrisma.orderItem.update({ where: { id: order.orderItems[0].id }, data: { preorderReleasedAt: new Date() } });
    await expect(isBlockedByPresaleForMercadoLibre(f.component.id, testPrisma)).resolves.toBe(false);
  });
});
