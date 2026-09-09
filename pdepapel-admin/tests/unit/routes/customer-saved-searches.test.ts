import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    customerSavedSearch: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      count: mocks.count,
      create: mocks.create,
      deleteMany: mocks.deleteMany,
    },
  },
}));
vi.mock("@/lib/cors", () => ({
  createCorsHeaders: () => ({ "Access-Control-Allow-Origin": "https://papeleriapdepapel.com" }),
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
}));

import { DELETE, GET, POST } from "@/app/api/[storeId]/account/saved-searches/route";

const params = { storeId: "store-id" };
const base = "https://admin.example.com/api/store-id/account/saved-searches";
const post = (body: unknown) => POST(new Request(base, { method: "POST", body: JSON.stringify(body) }), { params });

describe("customer saved searches API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "customer-id" });
    mocks.findMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(null);
    mocks.count.mockResolvedValue(0);
    mocks.create.mockImplementation(async ({ data }) => ({ id: "saved-1", ...data, createdAt: new Date() }));
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("lists only the signed-in customer's searches", async () => {
    const response = await GET(new Request(base), { params });
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-id", userId: "customer-id" } }));
  });

  it("rejects anonymous requests", async () => {
    mocks.auth.mockReturnValue({ userId: null });
    const response = await GET(new Request(base), { params });
    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("stores a cleaned query string without the page number", async () => {
    const response = await post({ name: "  Stickers rosados ", query: "?categoryId=cat-1&colorId=pink&isOnSale=false&exact=&page=3" });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { storeId: "store-id", userId: "customer-id", name: "Stickers rosados", query: "categoryId=cat-1&colorId=pink" } }),
    );
  });

  it("returns the existing search instead of duplicating the same query", async () => {
    mocks.findFirst.mockResolvedValue({ id: "saved-0", name: "Ya guardada", query: "search=washi", createdAt: new Date() });
    const response = await post({ name: "Otra", query: "search=washi" });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("caps the number of saved searches per customer", async () => {
    mocks.count.mockResolvedValue(20);
    const response = await post({ name: "Una más", query: "search=washi" });
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects an empty name or a query without filters", async () => {
    expect((await post({ name: "", query: "search=washi" })).status).toBe(400);
    expect((await post({ name: "Vacía", query: "?page=2" })).status).toBe(400);
  });

  it("deletes only a search owned by the signed-in customer", async () => {
    const response = await DELETE(new Request(`${base}?id=saved-1`, { method: "DELETE" }), { params });
    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: "saved-1", storeId: "store-id", userId: "customer-id" } });
  });
});
