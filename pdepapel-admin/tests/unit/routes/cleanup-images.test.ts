import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  requireStoreRead: vi.fn(),
  deleteResources: vi.fn(),
  resources: vi.fn(),
  imageUrls: [] as string[],
  orderItemUrls: [] as string[],
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
// Las lecturas abiertas a cuentas de solo lectura pasan por este ayudante.
vi.mock("@/lib/store-access", () => ({ requireStoreRead: mocks.requireStoreRead }));
vi.mock("@/lib/cloudinary", () => ({
  default: {
    v2: {
      api: {
        delete_resources: mocks.deleteResources,
        resources: mocks.resources,
      },
    },
  },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: {} },
  verifyStoreOwner: mocks.verifyStoreOwner,
  getPublicIdFromCloudinaryUrl: (url: string) =>
    url.split("/upload/")[1]?.replace(/^v\d+\//, "").replace(/\.\w+$/, "") ??
    null,
}));
vi.mock("@/lib/prismadb", () => {
  const empty = { findMany: async () => [] };
  return {
    default: {
      image: { findMany: async () => mocks.imageUrls.map((url) => ({ url })) },
      orderItem: {
        findMany: async () =>
          mocks.orderItemUrls.map((imageUrl) => ({ imageUrl })),
      },
      productVideo: empty,
      category: empty,
      homeContent: empty,
      store: empty,
      shipping: empty,
      product: empty,
      productGroup: empty,
      conversationMessage: empty,
    },
  };
});

import { DELETE, GET } from "@/app/api/[storeId]/cleanup-images/route";
import { AppError } from "@/lib/api-errors";

const CLOUD = "https://res.cloudinary.com/demo/image/upload/v1";
const params = { params: { storeId: "store-1" } };
const del = (publicIds: unknown) =>
  DELETE(
    new Request("http://admin.test/api/store-1/cleanup-images", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicIds }),
    }),
    params,
  );

/**
 * El escaneo miraba solo `Image`, así que una foto que ya solo vive en un
 * pedido salía como huérfana; y el DELETE borraba lo que pidiera el cliente
 * sin volver a mirar la base.
 */
describe("cleanup-images route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.requireStoreRead.mockResolvedValue({ userId: "owner-id", role: "owner" });
    mocks.imageUrls = [`${CLOUD}/foto-producto.png`];
    mocks.orderItemUrls = [`${CLOUD}/foto-pedido.png`];
    mocks.resources.mockResolvedValue({
      resources: [
        { public_id: "foto-producto", bytes: 10 },
        { public_id: "foto-pedido", bytes: 20 },
        { public_id: "sobra", bytes: 30 },
      ],
    });
    mocks.deleteResources.mockResolvedValue({ deleted: { sobra: "deleted" } });
  });

  it("GET only lists files nobody references, including order snapshots", async () => {
    const res = await GET(new Request("http://admin.test"), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.orphans.map((o: { public_id: string }) => o.public_id)).toEqual(["sobra"]);
    expect(body.stats).toMatchObject({ count: 1, totalSize: 30, scannedCount: 3 });
  });

  it("DELETE refuses with 409 when a requested id is still referenced and deletes nothing", async () => {
    const res = await del(["sobra", "foto-pedido"]);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("foto-pedido");
    expect(body.error).toContain("OrderItem.imageUrl");
    expect(mocks.deleteResources).not.toHaveBeenCalled();
  });

  it("DELETE removes ids that are still orphans at deletion time", async () => {
    const res = await del(["sobra", "sobra"]);
    expect(res.status).toBe(200);
    expect(mocks.deleteResources).toHaveBeenCalledWith(["sobra"], {
      type: "upload",
      resource_type: "image",
    });
  });

  it("DELETE rejects an empty or malformed list", async () => {
    expect((await del([])).status).toBe(400);
    expect((await del([42])).status).toBe(400);
    expect(mocks.deleteResources).not.toHaveBeenCalled();
  });

  it("requires a session and store ownership", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await del(["sobra"])).status).toBe(401);
    mocks.auth.mockResolvedValue({ userId: "intruso" });
    mocks.verifyStoreOwner.mockRejectedValue(new AppError("No autorizado", 403));
    const res = await del(["sobra"]);
    expect(res.status).toBe(403);
    expect(mocks.deleteResources).not.toHaveBeenCalled();
  });
});
