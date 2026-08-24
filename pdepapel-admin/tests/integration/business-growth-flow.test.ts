import {
  BusinessCashMovementType,
  GrowthCampaignChannel,
  GrowthCampaignObjective,
  GrowthCampaignStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

describe("business growth data flow with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("keeps cash planning records and a social campaign draft scoped to its store", async () => {
    fixture = await createInventoryFixture();

    await testPrisma.businessCashPolicy.create({
      data: {
        storeId: fixture.store.id,
        minimumOperatingReserve: 120000,
        taxReserveRate: 10,
        reinvestmentRate: 45,
        ownerDrawRate: 45,
        marketingTestRate: 15,
        minimumCampaignMarginPct: 35,
        minimumCampaignStock: 6,
        minimumCampaignDaysCover: 14,
      },
    });
    await testPrisma.businessCashMovement.create({
      data: {
        storeId: fixture.store.id,
        type: BusinessCashMovementType.MARKETING_SPEND,
        amount: 25000,
        description: "Prueba de contenido de agosto",
        occurredAt: new Date("2026-08-24T12:00:00.000Z"),
        createdBy: fixture.store.userId,
      },
    });
    const campaign = await testPrisma.growthCampaign.create({
      data: {
        storeId: fixture.store.id,
        name: "Prueba de agendas para Instagram",
        channel: GrowthCampaignChannel.INSTAGRAM,
        objective: GrowthCampaignObjective.SALES,
        status: GrowthCampaignStatus.READY,
        seasonLabel: "Regreso a clases",
        landingPath: `/producto/${fixture.component.slug}?utm_source=instagram&utm_medium=paid_social&utm_campaign=agendas-prueba`,
        utmSource: "instagram",
        utmMedium: "paid_social",
        utmCampaign: "agendas-prueba",
        plannedBudget: 25000,
        createdBy: fixture.store.userId,
        products: {
          create: { productId: fixture.component.id },
        },
      },
      include: {
        products: { include: { product: { select: { name: true } } } },
      },
    });

    await expect(
      testPrisma.businessCashPolicy.findUniqueOrThrow({
        where: { storeId: fixture.store.id },
      }),
    ).resolves.toMatchObject({
      minimumOperatingReserve: expect.anything(),
      taxReserveRate: expect.anything(),
      reinvestmentRate: expect.anything(),
      ownerDrawRate: expect.anything(),
    });
    await expect(
      testPrisma.businessCashMovement.findMany({
        where: {
          storeId: fixture.store.id,
          type: BusinessCashMovementType.MARKETING_SPEND,
        },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        amount: expect.anything(),
        description: "Prueba de contenido de agosto",
      }),
    ]);
    expect(campaign).toMatchObject({
      status: GrowthCampaignStatus.READY,
      channel: GrowthCampaignChannel.INSTAGRAM,
      objective: GrowthCampaignObjective.SALES,
      products: [
        expect.objectContaining({
          productId: fixture.component.id,
          product: { name: "Componente" },
        }),
      ],
    });

    await expect(
      testPrisma.growthCampaignProduct.create({
        data: {
          campaignId: campaign.id,
          productId: fixture.component.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
