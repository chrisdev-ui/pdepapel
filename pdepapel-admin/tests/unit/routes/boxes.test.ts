import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  boxFindFirst: vi.fn(),
  boxFindMany: vi.fn(),
  boxCreate: vi.fn(),
  boxUpdateMany: vi.fn(),
  boxDeleteMany: vi.fn(),
  shippingCount: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: {
    NO_CACHE: { "Cache-Control": "no-store" },
    STATIC: { "Cache-Control": "public, s-maxage=3600" },
  },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));
vi.mock("@/lib/prismadb", () => {
  const box = {
    findFirst: mocks.boxFindFirst,
    findMany: mocks.boxFindMany,
    create: mocks.boxCreate,
    updateMany: mocks.boxUpdateMany,
    deleteMany: mocks.boxDeleteMany,
  };
  const client = {
    box,
    shipping: { count: mocks.shippingCount },
    $transaction: mocks.transaction,
  };
  // The transaction callback receives the same client so the assertions
  // can look at the mocked model methods directly.
  mocks.transaction.mockImplementation(
    (callback: (tx: typeof client) => Promise<unknown>) => callback(client),
  );
  return { default: client };
});

import { GET as listBoxes, POST } from "@/app/api/[storeId]/boxes/route";
import {
  DELETE,
  GET,
  PATCH,
} from "@/app/api/[storeId]/boxes/[boxId]/route";

const storeId = "store-id";
const boxId = "box-id";
const params = { storeId, boxId };

const storedBox = {
  id: boxId,
  storeId,
  name: "Caja mediana",
  type: "M",
  width: 33,
  height: 10,
  length: 20,
  isDefault: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const validPayload = {
  name: "Caja grande",
  type: "L",
  width: 33,
  height: 10,
  length: 26,
  isDefault: true,
};

function jsonRequest(method: string, body: unknown) {
  return new Request(`https://admin.example.com/api/${storeId}/boxes`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("boxes API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          box: {
            findFirst: mocks.boxFindFirst,
            findMany: mocks.boxFindMany,
            create: mocks.boxCreate,
            updateMany: mocks.boxUpdateMany,
            deleteMany: mocks.boxDeleteMany,
          },
        }),
    );
    mocks.auth.mockResolvedValue({ userId: "owner-id" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.boxFindMany.mockResolvedValue([]);
    mocks.boxFindFirst.mockResolvedValue(storedBox);
    mocks.boxCreate.mockResolvedValue({ ...storedBox, ...validPayload });
    mocks.boxUpdateMany.mockResolvedValue({ count: 1 });
    mocks.boxDeleteMany.mockResolvedValue({ count: 1 });
    mocks.shippingCount.mockResolvedValue(0);
  });

  describe("POST", () => {
    it("rejects an invalid payload with 400 and a Spanish field message", async () => {
      const response = await POST(
        jsonRequest("POST", { ...validPayload, width: 301 }),
        { params: { storeId } },
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("La medida máxima es 300 cm");
      expect(body.details.fieldErrors.width).toEqual(["La medida máxima es 300 cm"]);
      expect(mocks.boxCreate).not.toHaveBeenCalled();
    });

    it("rejects an unknown box type", async () => {
      const response = await POST(
        jsonRequest("POST", { ...validPayload, type: "XXL" }),
        { params: { storeId } },
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Elige un tipo: XS, S, M, L, XL");
    });

    it("refuses a duplicate name in the same store regardless of case", async () => {
      mocks.boxFindMany.mockResolvedValue([{ id: "other", name: "caja GRANDE" }]);

      const response = await POST(jsonRequest("POST", validPayload), {
        params: { storeId },
      });

      expect(response.status).toBe(409);
      expect(mocks.boxCreate).not.toHaveBeenCalled();
    });

    it("unsets the previous default of the same type and creates in one transaction", async () => {
      const response = await POST(
        jsonRequest("POST", { ...validPayload, width: "12,5" }),
        { params: { storeId } },
      );

      expect(response.status).toBe(200);
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.boxUpdateMany).toHaveBeenCalledWith({
        where: { storeId, type: "L", isDefault: true },
        data: { isDefault: false },
      });
      expect(mocks.boxCreate).toHaveBeenCalledWith({
        data: { ...validPayload, width: 12.5, storeId },
      });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("requires a signed-in owner", async () => {
      mocks.auth.mockResolvedValue({ userId: null });

      const response = await POST(jsonRequest("POST", validPayload), {
        params: { storeId },
      });

      expect(response.status).toBe(401);
      expect(mocks.boxCreate).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("lists the owner's boxes without a shared cache", async () => {
      mocks.boxFindMany.mockResolvedValue([storedBox]);

      const response = await listBoxes(
        new Request(`https://admin.example.com/api/${storeId}/boxes`),
        { params: { storeId } },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(mocks.verifyStoreOwner).toHaveBeenCalledWith("owner-id", storeId);
    });

    it("returns the box with its shipments count", async () => {
      mocks.shippingCount.mockResolvedValue(3);

      const response = await GET(
        new Request(`https://admin.example.com/api/${storeId}/boxes/${boxId}`),
        { params },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.shipmentsCount).toBe(3);
      expect(mocks.boxFindFirst).toHaveBeenCalledWith({
        where: { id: boxId, storeId },
      });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("returns 404 for a box that belongs to another store", async () => {
      mocks.boxFindFirst.mockResolvedValue(null);

      const response = await GET(
        new Request(`https://admin.example.com/api/${storeId}/boxes/${boxId}`),
        { params },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH", () => {
    it("rejects an invalid payload with 400 before touching the database", async () => {
      const response = await PATCH(
        jsonRequest("PATCH", { ...validPayload, height: "0,5" }),
        { params },
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("La medida mínima es 1 cm");
      expect(mocks.boxUpdateMany).not.toHaveBeenCalled();
    });

    it("returns 404 when the id belongs to another store", async () => {
      mocks.boxFindFirst.mockResolvedValue(null);

      const response = await PATCH(jsonRequest("PATCH", validPayload), {
        params,
      });

      expect(response.status).toBe(404);
      expect(mocks.boxFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: boxId, storeId } }),
      );
      expect(mocks.boxUpdateMany).not.toHaveBeenCalled();
    });

    it("refuses to rename to another box's name in the store", async () => {
      mocks.boxFindMany.mockResolvedValue([{ id: "other", name: "Caja Grande" }]);

      const response = await PATCH(jsonRequest("PATCH", validPayload), {
        params,
      });

      expect(response.status).toBe(409);
      expect(mocks.boxFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId, NOT: { id: boxId } },
        }),
      );
    });

    it("updates within the store and unsets other defaults in one transaction", async () => {
      const response = await PATCH(jsonRequest("PATCH", validPayload), {
        params,
      });

      expect(response.status).toBe(200);
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.boxUpdateMany).toHaveBeenNthCalledWith(1, {
        where: { storeId, type: "L", isDefault: true, NOT: { id: boxId } },
        data: { isDefault: false },
      });
      expect(mocks.boxUpdateMany).toHaveBeenNthCalledWith(2, {
        where: { id: boxId, storeId },
        data: validPayload,
      });
    });
  });

  describe("DELETE", () => {
    it("returns 404 when the box belongs to another store", async () => {
      mocks.boxFindFirst.mockResolvedValue(null);

      const response = await DELETE(
        new Request(`https://admin.example.com/api/${storeId}/boxes/${boxId}`, {
          method: "DELETE",
        }),
        { params },
      );

      expect(response.status).toBe(404);
      expect(mocks.boxDeleteMany).not.toHaveBeenCalled();
    });

    it("refuses with 409 and the usage count when shipments reference the box", async () => {
      mocks.shippingCount.mockResolvedValue(2);

      const response = await DELETE(
        new Request(`https://admin.example.com/api/${storeId}/boxes/${boxId}`, {
          method: "DELETE",
        }),
        { params },
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error).toContain("2 envíos la usan");
      expect(body.details.shipmentsCount).toBe(2);
      expect(mocks.boxDeleteMany).not.toHaveBeenCalled();
    });

    it("deletes an unused box scoped to the store", async () => {
      const response = await DELETE(
        new Request(`https://admin.example.com/api/${storeId}/boxes/${boxId}`, {
          method: "DELETE",
        }),
        { params },
      );

      expect(response.status).toBe(200);
      expect(mocks.boxDeleteMany).toHaveBeenCalledWith({
        where: { id: boxId, storeId },
      });
    });
  });
});
