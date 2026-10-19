import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));

import { getProduct } from "@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/server/get-product";

/**
 * La ficha del producto le daba a la cuenta de solo lectura la lista de
 * reseñas con el id de quien escribió y la moderación, y el margen mínimo
 * de la tienda (sale de los costos).
 */
let fixture: InventoryFixture | undefined;

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  await testPrisma.store.update({ where: { id: fixture.store.id }, data: { storeMinMarginPercent: 30 } });
  await testPrisma.review.create({
    data: {
      storeId: fixture.store.id,
      productId: fixture.component.id,
      userId: "user_cliente_1",
      name: "Clienta",
      rating: 5,
      comment: "Muy bonito",
      status: "PUBLISHED",
      moderatedBy: "owner",
      moderationNote: "ok",
      reply: "¡Gracias!",
      repliedBy: "owner",
    } as never,
  });
});

afterAll(async () => {
  if (fixture) {
    await testPrisma.review.deleteMany({ where: { storeId: fixture.store.id } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$disconnect();
});

const signIn = (role: "owner" | "viewer") => {
  session.userId = role === "owner" ? fixture!.store.userId : "user_viewer_reviews";
  session.claims = role === "viewer" ? { metadata: { role: "viewer", allowedStoreIds: [fixture!.store.id] } } : {};
};

describe("ficha del producto: reseñas y margen mínimo (MySQL)", () => {
  it("solo lectura: reseñas sin quién escribió ni moderación, y sin margen mínimo", async () => {
    signIn("viewer");
    const result = await getProduct(fixture!.component.id, fixture!.store.id);
    assertNoForbiddenKeys({ product: result.product, reviews: result.reviews }, "viewer");
    expect(result.reviews[0]).toMatchObject({ rating: "5", comment: "Muy bonito", reply: "¡Gracias!" });
    expect(result.storeMinMarginPercent).toBeNull();
  });

  it("la dueña ve quién escribió y el margen mínimo", async () => {
    signIn("owner");
    const result = await getProduct(fixture!.component.id, fixture!.store.id);
    expect(result.reviews[0]).toMatchObject({ userId: "user_cliente_1" });
    expect(result.storeMinMarginPercent).toBe(30);
  });
});
