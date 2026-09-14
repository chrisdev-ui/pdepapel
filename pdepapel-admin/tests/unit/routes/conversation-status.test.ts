import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prismadb", () => ({
  default: { conversation: { findFirst: mocks.findFirst, update: mocks.update } },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));

import { PATCH } from "@/app/api/[storeId]/conversations/[conversationId]/route";

const params = { params: { storeId: "store-1", conversationId: "conversation-1" } };

const request = (body: unknown) =>
  new Request("https://admin.test/api/store-1/conversations/conversation-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/[storeId]/conversations/[conversationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.findFirst.mockResolvedValue({ id: "conversation-1" });
    mocks.update.mockResolvedValue({ id: "conversation-1", status: "RESOLVED" });
  });

  it("marks a conversation resolved for the store owner", async () => {
    const response = await PATCH(request({ status: "RESOLVED" }), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "conversation-1", status: "RESOLVED" });
    expect(mocks.verifyStoreOwner).toHaveBeenCalledWith("user-1", "store-1");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { status: "RESOLVED" },
      select: { id: true, status: true },
    });
  });

  it("reopens a conversation", async () => {
    mocks.update.mockResolvedValue({ id: "conversation-1", status: "OPEN" });

    const response = await PATCH(request({ status: "OPEN" }), params);

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data).toEqual({ status: "OPEN" });
  });

  it("requires a signed-in owner before touching anything", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await PATCH(request({ status: "RESOLVED" }), params);

    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a status that is not one of the three", async () => {
    for (const body of [{ status: "ARCHIVED" }, { status: null }, {}]) {
      const response = await PATCH(request(body), params);
      expect(response.status).toBe(400);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not touch a conversation belonging to another store", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await PATCH(request({ status: "RESOLVED" }), params);

    expect(response.status).toBe(404);
    // El filtro incluye la tienda: una conversación ajena no se encuentra.
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "conversation-1", storeId: "store-1" },
      select: { id: true },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
