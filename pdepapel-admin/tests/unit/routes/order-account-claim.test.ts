import { beforeEach, describe, expect, it, vi } from "vitest";

const TestApiError = vi.hoisted(
  () =>
    class TestApiError extends Error {
      constructor(
        message: string,
        public readonly status: number,
      ) {
        super(message);
      }
    },
);

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getUser: vi.fn(),
  findOrder: vi.fn(),
  findClaim: vi.fn(),
  upsertClaim: vi.fn(),
  updateOrder: vi.fn(),
  updateClaim: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/api-errors", () => ({
  ErrorFactory: {
    InvalidRequest: (message: string) => new TestApiError(message, 400),
    MissingStoreId: () => new TestApiError("Missing store ID", 400),
    Unauthenticated: () => new TestApiError("Unauthenticated", 401),
    Unauthorized: () => new TestApiError("Unauthorized", 403),
    Conflict: (message: string) => new TestApiError(message, 409),
  },
  handleErrorResponse: (error: unknown, _context: string, options?: {
    headers?: HeadersInit;
  }) =>
    new Response(null, {
      status: error instanceof TestApiError ? error.status : 500,
      headers: options?.headers,
    }),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    order: { findFirst: mocks.findOrder },
    orderAccountClaim: {
      findFirst: mocks.findClaim,
      upsert: mocks.upsertClaim,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
}));

vi.mock("@clerk/nextjs", () => ({
  auth: mocks.auth,
  clerkClient: { users: { getUser: mocks.getUser } },
}));

import {
  PATCH,
  POST,
} from "@/app/api/[storeId]/orders/[orderId]/account/route";

const params = { storeId: "store-id", orderId: "order-id" };
const request = (method: "POST" | "PATCH", body: Record<string, unknown>) =>
  new Request(
    "https://admin.example.com/api/store-id/orders/order-id/account",
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: "https://papeleriapdepapel.com",
      },
      body: JSON.stringify(body),
    },
  );

describe("guest order account claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "customer-id" });
    mocks.findOrder.mockResolvedValue({
      id: "order-id",
      email: "compras@ejemplo.com",
      userId: null,
    });
    mocks.findClaim.mockResolvedValue({ id: "claim-id" });
    mocks.upsertClaim.mockResolvedValue({ id: "claim-id" });
    mocks.getUser.mockResolvedValue({
      primaryEmailAddressId: "email-id",
      emailAddresses: [
        {
          id: "email-id",
          emailAddress: "compras@ejemplo.com",
          verification: { status: "verified" },
        },
      ],
    });
    mocks.updateOrder.mockResolvedValue({ count: 1 });
    mocks.updateClaim.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        order: { updateMany: mocks.updateOrder },
        orderAccountClaim: { updateMany: mocks.updateClaim },
      }),
    );
  });

  it("issues a short-lived token only to the original guest device", async () => {
    const response = await POST(request("POST", { guestId: "guest-id-123456789" }), {
      params,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
    const body = await response.json();
    expect(body.token).toHaveLength(43);
    expect(mocks.upsertClaim).toHaveBeenCalledWith({
      where: { orderId: "order-id" },
      update: expect.objectContaining({
        tokenHash: expect.not.stringContaining(body.token),
      }),
      create: expect.objectContaining({
        orderId: "order-id",
        tokenHash: expect.not.stringContaining(body.token),
      }),
    });
  });

  it("refuses to issue a claim for a different guest or an already linked order", async () => {
    mocks.findOrder.mockResolvedValueOnce(null);

    const response = await POST(request("POST", { guestId: "guest-id-123456789" }), {
      params,
    });

    expect(response.status).toBe(403);
    expect(mocks.upsertClaim).not.toHaveBeenCalled();
  });

  it("requires an authenticated session before claiming an order", async () => {
    mocks.auth.mockReturnValue({ userId: null });

    const response = await PATCH(request("PATCH", { token: "a".repeat(43) }), {
      params,
    });

    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("claims only when the authenticated, verified email matches the order", async () => {
    const response = await PATCH(request("PATCH", { token: "a".repeat(43) }), {
      params,
    });

    expect(response.status).toBe(200);
    expect(mocks.updateOrder).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "order-id",
        storeId: "store-id",
      }),
      data: { userId: "customer-id", guestId: null },
    });
    expect(mocks.updateClaim).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "claim-id",
        claimedAt: null,
      }),
      data: expect.objectContaining({ claimedAt: expect.any(Date) }),
    });
  });

  it("rejects a signed-in customer whose verified email does not match", async () => {
    mocks.getUser.mockResolvedValueOnce({
      primaryEmailAddressId: "email-id",
      emailAddresses: [
        {
          id: "email-id",
          emailAddress: "otra@ejemplo.com",
          verification: { status: "verified" },
        },
      ],
    });

    const response = await PATCH(request("PATCH", { token: "a".repeat(43) }), {
      params,
    });

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
