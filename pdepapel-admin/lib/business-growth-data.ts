import { endOfMonth, startOfMonth } from "date-fns";

import { getMonthlyFinancialSummary } from "@/actions/get-financial-analytics";
import { getInventoryRisk } from "@/actions/get-inventory-risk";
import {
  getDeadInventory,
  getProductProfitRanking,
} from "@/actions/get-product-profitability";
import {
  type BusinessCashMovementType,
  type BusinessCashPlan,
  type BusinessCashPolicyInput,
  calculateBusinessCashPlan,
  DEFAULT_BUSINESS_CASH_POLICY,
  getCommercialSeason,
  recommendSocialCampaigns,
} from "@/lib/business-growth";
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";
import {
  GrowthCampaignChannel,
  GrowthCampaignObjective,
  GrowthCampaignStatus,
} from "@prisma/client";

function numberValue(value: { toString(): string } | number | null) {
  return value === null ? null : Number(value);
}

function policyFromRecord(
  policy: {
    minimumOperatingReserve: { toString(): string };
    taxReserveRate: { toString(): string };
    reinvestmentRate: { toString(): string };
    ownerDrawRate: { toString(): string };
    marketingTestRate: { toString(): string };
    minimumCampaignMarginPct: { toString(): string };
    minimumCampaignStock: number;
    minimumCampaignDaysCover: number;
  } | null,
): BusinessCashPolicyInput {
  if (!policy) return DEFAULT_BUSINESS_CASH_POLICY;

  return {
    minimumOperatingReserve: Number(policy.minimumOperatingReserve),
    taxReserveRate: Number(policy.taxReserveRate),
    reinvestmentRate: Number(policy.reinvestmentRate),
    ownerDrawRate: Number(policy.ownerDrawRate),
    marketingTestRate: Number(policy.marketingTestRate),
    minimumCampaignMarginPct: Number(policy.minimumCampaignMarginPct),
    minimumCampaignStock: policy.minimumCampaignStock,
    minimumCampaignDaysCover: policy.minimumCampaignDaysCover,
  };
}

function campaignValue(
  value: { toString(): string } | number | null | undefined,
) {
  return value === null || value === undefined ? null : Number(value);
}

export type BusinessGrowthOverview = {
  period: { start: string; end: string; label: string };
  policy: BusinessCashPolicyInput & { isConfigured: boolean };
  financial: {
    netRevenue: number;
    operatingProfit: number;
    averageMargin: number;
    salesCount: number;
  };
  cashPlan: BusinessCashPlan;
  cashMovements: Array<{
    id: string;
    type: BusinessCashMovementType;
    amount: number;
    description: string;
    occurredAt: string;
    reference: string | null;
    notes: string | null;
    createdBy: string;
  }>;
  campaignRecommendations: ReturnType<typeof recommendSocialCampaigns>;
  campaigns: Array<{
    id: string;
    name: string;
    channel: GrowthCampaignChannel;
    objective: GrowthCampaignObjective;
    status: GrowthCampaignStatus;
    seasonLabel: string | null;
    landingPath: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    brief: string | null;
    plannedBudget: number | null;
    actualSpend: number | null;
    attributedRevenue: number | null;
    externalCampaignId: string | null;
    externalUrl: string | null;
    startsAt: string | null;
    endsAt: string | null;
    productNames: string[];
    createdAt: string;
  }>;
  dataQuality: {
    productsWithoutCost: number;
    note: string;
  };
  season: string;
};

export async function getBusinessGrowthOverview(
  storeId: string,
  referenceDate = getColombiaDate(),
): Promise<BusinessGrowthOverview> {
  const start = startOfMonth(referenceDate);
  const end = endOfMonth(referenceDate);
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;

  const [
    financial,
    policyRecord,
    movements,
    topProducts,
    risks,
    deadStock,
    campaigns,
    productsWithoutCost,
    candidateProducts,
  ] = await Promise.all([
    getMonthlyFinancialSummary(storeId, year, month),
    prismadb.businessCashPolicy.findUnique({
      where: { storeId },
    }),
    prismadb.businessCashMovement.findMany({
      where: {
        storeId,
        occurredAt: { gte: start, lte: end },
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    getProductProfitRanking(storeId, undefined, undefined, 100),
    getInventoryRisk(storeId),
    getDeadInventory(storeId, 60),
    prismadb.growthCampaign.findMany({
      where: { storeId },
      include: {
        products: {
          include: { product: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prismadb.product.count({
      where: {
        storeId,
        isArchived: false,
        OR: [{ acqPrice: null }, { acqPrice: { lte: 0 } }],
      },
    }),
    prismadb.product.findMany({
      where: { storeId, isArchived: false },
      select: {
        id: true,
        name: true,
        slug: true,
        stock: true,
        acqPrice: true,
        description: true,
        images: { select: { id: true } },
      },
      orderBy: [{ stock: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
  ]);

  const policy = policyFromRecord(policyRecord);
  const cashMovements = movements.map((movement) => ({
    id: movement.id,
    type: movement.type as BusinessCashMovementType,
    amount: Number(movement.amount),
    description: movement.description,
    occurredAt: movement.occurredAt.toISOString(),
    reference: movement.reference,
    notes: movement.notes,
    createdBy: movement.createdBy,
  }));
  const cashPlan = calculateBusinessCashPlan({
    operatingProfit: financial.total_net_profit,
    policy,
    movements: cashMovements,
  });

  const profitByProductId = new Map(
    topProducts.map((product) => [product.productId, product]),
  );
  const riskByProductId = new Map(risks.map((risk) => [risk.productId, risk]));
  const deadProductIds = new Set(deadStock.map((product) => product.id));
  const campaignRecommendations = recommendSocialCampaigns({
    candidates: candidateProducts.map((product) => {
      const productProfit = profitByProductId.get(product.id);
      const risk = riskByProductId.get(product.id);

      return {
        productId: product.id,
        productName: product.name,
        slug: product.slug,
        stock: product.stock,
        acquisitionCost: numberValue(product.acqPrice),
        imageCount: product.images.length,
        descriptionLength: product.description.trim().length,
        totalQuantitySold: productProfit?.totalQuantitySold ?? 0,
        totalProfit: productProfit?.totalProfit ?? 0,
        profitMarginPct: productProfit?.profitMarginPct ?? null,
        riskState: risk?.riskState ?? "NO_DATA",
        daysUntilStockout: risk?.daysUntilStockout ?? null,
        isDeadStock: deadProductIds.has(product.id),
      };
    }),
    policy,
    testBudget: cashPlan.suggestedMarketingTestBudget,
  });

  return {
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      label: referenceDate.toLocaleDateString("es-CO", {
        month: "long",
        year: "numeric",
      }),
    },
    policy: { ...policy, isConfigured: Boolean(policyRecord) },
    financial: {
      netRevenue: financial.total_revenue,
      operatingProfit: financial.total_net_profit,
      averageMargin: financial.average_margin,
      salesCount: financial.total_orders,
    },
    cashPlan,
    cashMovements,
    campaignRecommendations,
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      objective: campaign.objective,
      status: campaign.status,
      seasonLabel: campaign.seasonLabel,
      landingPath: campaign.landingPath,
      utmSource: campaign.utmSource,
      utmMedium: campaign.utmMedium,
      utmCampaign: campaign.utmCampaign,
      brief: campaign.brief,
      plannedBudget: campaignValue(campaign.plannedBudget),
      actualSpend: campaignValue(campaign.actualSpend),
      attributedRevenue: campaignValue(campaign.attributedRevenue),
      externalCampaignId: campaign.externalCampaignId,
      externalUrl: campaign.externalUrl,
      startsAt: campaign.startsAt?.toISOString() ?? null,
      endsAt: campaign.endsAt?.toISOString() ?? null,
      productNames: campaign.products.map((item) => item.product.name),
      createdAt: campaign.createdAt.toISOString(),
    })),
    dataQuality: {
      productsWithoutCost,
      note:
        productsWithoutCost > 0
          ? "Los productos sin costo no se recomiendan para pauta pagada hasta completar ese dato."
          : "Los cálculos usan las ventas netas registradas y los gastos que agregues en este panel.",
    },
    season: getCommercialSeason(referenceDate),
  };
}
