import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: session.userId }) }));
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { uploader: { destroy: vi.fn() }, api: { delete_resources: vi.fn() } } } }));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));

const patch = async (storeId: string, body: Record<string, unknown>) => {
  const { PATCH } = await import("@/app/api/stores/[storeId]/route");
  return PATCH(
    new Request("http://admin.test/api/stores/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: { storeId } },
  );
};

describe("Mercado Libre pricing targets in store settings (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("new stores start at 20 % and 10.000 COP; the owner saves new values; a save without them keeps them", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const read = () =>
      testPrisma.store.findUniqueOrThrow({
        where: { id: fixture!.store.id },
        select: { mercadoLibreTargetMarginPercent: true, mercadoLibreMinNetPerUnit: true },
      });
    expect(await read()).toEqual({ mercadoLibreTargetMarginPercent: 20, mercadoLibreMinNetPerUnit: 10_000 });

    const saved = await patch(fixture.store.id, { name: fixture.store.name, mercadoLibreTargetMarginPercent: "25", mercadoLibreMinNetPerUnit: "12.000" });
    expect(saved.status).toBe(200);
    expect(await read()).toEqual({ mercadoLibreTargetMarginPercent: 25, mercadoLibreMinNetPerUnit: 12_000 });

    expect((await patch(fixture.store.id, { name: fixture.store.name })).status).toBe(200);
    expect(await read()).toEqual({ mercadoLibreTargetMarginPercent: 25, mercadoLibreMinNetPerUnit: 12_000 });
  });

  it("rejects a target that would make every suggestion impossible", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const response = await patch(fixture.store.id, { name: fixture.store.name, mercadoLibreTargetMarginPercent: 75 });
    expect(response.status).toBe(400);
  });
});
