import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  HOME_CONTENT_ADMIN_SELECT,
  homeContentDataFromInput,
  liveHomeContentWhere,
  parseHomeContentBody,
  selectLiveHomeContent,
} from "@/lib/home-content";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

describe("home content flow with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (fixture) {
      await testPrisma.homeContentProduct.deleteMany({ where: { homeContent: { storeId: fixture.store.id } } });
      await testPrisma.homeContent.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("serves the live hero and shipment campaign with its products, skipping drafts and expired entries", async () => {
    fixture = await createInventoryFixture();
    const storeId = fixture.store.id;
    const create = (body: Record<string, unknown>, productIds: string[] = []) =>
      testPrisma.homeContent.create({
        data: {
          ...homeContentDataFromInput(parseHomeContentBody(body)),
          storeId,
          products: { create: productIds.map((productId, position) => ({ productId, position })) },
        },
      });

    const hero = { placement: "HERO", title: "Hero en vivo", imageUrl: "https://example.com/hero.jpg" };
    await create({ ...hero, title: "Hero viejo", startsAt: "2026-01-01" });
    await create({ ...hero, startsAt: "2026-06-01" });
    await create({ ...hero, title: "Hero borrador", startsAt: "2026-08-01", isActive: false });
    await create({ ...hero, title: "Hero futuro", startsAt: "2999-01-01" });
    await create(
      { placement: "CAMPAIGN", campaignType: "SHIPMENT", title: "Cargamento", imageUrl: "", startsAt: "2026-06-01", endsAt: "2999-12-31" },
      [fixture.component.id],
    );
    await create({
      placement: "CAMPAIGN",
      campaignType: "SEASON",
      title: "Campaña vencida",
      imageUrl: "https://example.com/old.jpg",
      startsAt: "2026-01-01",
      endsAt: "2026-01-31",
    });

    const now = new Date("2026-09-09T15:00:00.000Z");
    const entries = await testPrisma.homeContent.findMany({
      where: liveHomeContentWhere(storeId, now),
      select: HOME_CONTENT_ADMIN_SELECT,
    });
    const live = selectLiveHomeContent(entries, now);

    expect(live.hero?.title).toBe("Hero en vivo");
    expect(live.campaign?.campaignType).toBe("SHIPMENT");
    expect(live.campaign?.products.map((product) => product.id)).toEqual([fixture.component.id]);

    const other = await testPrisma.homeContent.findMany({ where: liveHomeContentWhere("another-store", now) });
    expect(other).toHaveLength(0);
  });
});
