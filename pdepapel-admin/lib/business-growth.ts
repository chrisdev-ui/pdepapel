export const BUSINESS_CASH_MOVEMENT_TYPES = [
  "OPERATING_EXPENSE",
  "MARKETING_SPEND",
  "TAX_PAYMENT",
  "INVENTORY_PURCHASE",
  "OWNER_DRAW",
  "OWNER_CONTRIBUTION",
  "OTHER_INFLOW",
  "OTHER_OUTFLOW",
] as const;

export type BusinessCashMovementType =
  (typeof BUSINESS_CASH_MOVEMENT_TYPES)[number];

export type BusinessCashPolicyInput = {
  minimumOperatingReserve: number;
  taxReserveRate: number;
  reinvestmentRate: number;
  ownerDrawRate: number;
  marketingTestRate: number;
  minimumCampaignMarginPct: number;
  minimumCampaignStock: number;
  minimumCampaignDaysCover: number;
};

export const DEFAULT_BUSINESS_CASH_POLICY: BusinessCashPolicyInput = {
  minimumOperatingReserve: 0,
  taxReserveRate: 0,
  reinvestmentRate: 50,
  ownerDrawRate: 50,
  marketingTestRate: 10,
  minimumCampaignMarginPct: 35,
  minimumCampaignStock: 5,
  minimumCampaignDaysCover: 14,
};

export type BusinessCashMovementInput = {
  type: BusinessCashMovementType;
  amount: number;
};

export type BusinessCashPlan = {
  operatingProfit: number;
  registeredExpenses: number;
  operatingExpenses: number;
  marketingSpend: number;
  taxPayments: number;
  otherOutflows: number;
  netAfterRegisteredExpenses: number;
  proposedTaxReserve: number;
  distributableAmount: number;
  recommendedReinvestment: number;
  recommendedOwnerDraw: number;
  remainingOwnerDraw: number;
  suggestedMarketingTestBudget: number;
  unallocatedSafetyAmount: number;
  inventoryPurchaseCommitments: number;
  recordedOwnerDraws: number;
  ownerContributions: number;
  otherInflows: number;
};

function sumMovements(
  movements: BusinessCashMovementInput[],
  types: BusinessCashMovementType[],
) {
  return movements
    .filter((movement) => types.includes(movement.type))
    .reduce((sum, movement) => sum + movement.amount, 0);
}

function nonNegative(value: number) {
  return Math.max(0, value);
}

export function validateBusinessCashPolicy(policy: BusinessCashPolicyInput) {
  const percentageFields: Array<keyof BusinessCashPolicyInput> = [
    "taxReserveRate",
    "reinvestmentRate",
    "ownerDrawRate",
    "marketingTestRate",
    "minimumCampaignMarginPct",
  ];
  const nonNegativeFields: Array<keyof BusinessCashPolicyInput> = [
    "minimumOperatingReserve",
    "minimumCampaignStock",
    "minimumCampaignDaysCover",
  ];

  for (const field of percentageFields) {
    if (
      !Number.isFinite(policy[field]) ||
      policy[field] < 0 ||
      policy[field] > 100
    ) {
      throw new Error(`El valor de ${field} debe estar entre 0 y 100`);
    }
  }

  for (const field of nonNegativeFields) {
    if (!Number.isFinite(policy[field]) || policy[field] < 0) {
      throw new Error(`El valor de ${field} no puede ser negativo`);
    }
  }

  if (policy.reinvestmentRate + policy.ownerDrawRate > 100) {
    throw new Error(
      "La reinversión y el retiro sugerido no pueden superar el 100% de la utilidad distribuible",
    );
  }
}

export function calculateBusinessCashPlan({
  operatingProfit,
  movements,
  policy,
}: {
  operatingProfit: number;
  movements: BusinessCashMovementInput[];
  policy: BusinessCashPolicyInput;
}): BusinessCashPlan {
  validateBusinessCashPolicy(policy);

  const operatingExpenses = sumMovements(movements, ["OPERATING_EXPENSE"]);
  const marketingSpend = sumMovements(movements, ["MARKETING_SPEND"]);
  const taxPayments = sumMovements(movements, ["TAX_PAYMENT"]);
  const otherOutflows = sumMovements(movements, ["OTHER_OUTFLOW"]);
  const registeredExpenses =
    operatingExpenses + marketingSpend + taxPayments + otherOutflows;
  const netAfterRegisteredExpenses = operatingProfit - registeredExpenses;
  const proposedTaxReserve =
    nonNegative(netAfterRegisteredExpenses) * (policy.taxReserveRate / 100);
  const distributableAmount = nonNegative(
    netAfterRegisteredExpenses -
      proposedTaxReserve -
      policy.minimumOperatingReserve,
  );
  const recommendedReinvestment =
    distributableAmount * (policy.reinvestmentRate / 100);
  const recommendedOwnerDraw =
    distributableAmount * (policy.ownerDrawRate / 100);
  const recordedOwnerDraws = sumMovements(movements, ["OWNER_DRAW"]);

  return {
    operatingProfit,
    registeredExpenses,
    operatingExpenses,
    marketingSpend,
    taxPayments,
    otherOutflows,
    netAfterRegisteredExpenses,
    proposedTaxReserve,
    distributableAmount,
    recommendedReinvestment,
    recommendedOwnerDraw,
    remainingOwnerDraw: nonNegative(recommendedOwnerDraw - recordedOwnerDraws),
    suggestedMarketingTestBudget:
      recommendedReinvestment * (policy.marketingTestRate / 100),
    unallocatedSafetyAmount: nonNegative(
      distributableAmount - recommendedReinvestment - recommendedOwnerDraw,
    ),
    inventoryPurchaseCommitments: sumMovements(movements, [
      "INVENTORY_PURCHASE",
    ]),
    recordedOwnerDraws,
    ownerContributions: sumMovements(movements, ["OWNER_CONTRIBUTION"]),
    otherInflows: sumMovements(movements, ["OTHER_INFLOW"]),
  };
}

export type CampaignChannel = "INSTAGRAM" | "TIKTOK" | "MULTI_CHANNEL";

export type CampaignRecommendationState =
  | "READY_TO_TEST"
  | "ORGANIC_FIRST"
  | "HOLD";

export type CampaignCandidate = {
  productId: string;
  productName: string;
  slug: string;
  stock: number;
  acquisitionCost: number | null;
  imageCount: number;
  descriptionLength: number;
  totalQuantitySold: number;
  totalProfit: number;
  profitMarginPct: number | null;
  riskState: "CRITICAL" | "WARNING" | "SAFE" | "NO_DATA";
  daysUntilStockout: number | null;
  isDeadStock: boolean;
};

export type CampaignRecommendation = {
  productId: string;
  productName: string;
  channel: CampaignChannel;
  state: CampaignRecommendationState;
  reason: string;
  objective: "SALES" | "TRAFFIC";
  landingPath: string;
  utmCampaign: string;
  suggestedBudget: number;
  brief: string;
};

function slugifyCampaignName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function getCommercialSeason(referenceDate = new Date()) {
  const month = referenceDate.getMonth() + 1;

  if (month <= 2 || month === 7) return "Regreso a clases";
  if (month === 5) return "Regalos para mamá";
  if (month === 9) return "Amor y amistad";
  if (month === 10) return "Halloween";
  if (month === 11 || month === 12) return "Navidad y regalos";
  return "Contenido creativo";
}

export function buildCampaignUtmPath({
  landingPath,
  channel,
  campaignName,
}: {
  landingPath: string;
  channel: CampaignChannel;
  campaignName: string;
}) {
  const source =
    channel === "TIKTOK"
      ? "tiktok"
      : channel === "INSTAGRAM"
        ? "instagram"
        : "social";
  const url = new URL(landingPath, "https://papeleriapdepapel.com");

  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "paid_social");
  url.searchParams.set("utm_campaign", slugifyCampaignName(campaignName));
  return `${url.pathname}${url.search}`;
}

function recommendationFor(
  candidate: CampaignCandidate,
  policy: BusinessCashPolicyInput,
) {
  const landingPath = `/producto/${candidate.slug}`;
  const campaignName = `producto-${candidate.productName}`;
  const utmCampaign = slugifyCampaignName(campaignName);
  const base = {
    productId: candidate.productId,
    productName: candidate.productName,
    channel: "MULTI_CHANNEL" as const,
    landingPath: buildCampaignUtmPath({
      landingPath,
      channel: "MULTI_CHANNEL",
      campaignName,
    }),
    utmCampaign,
  };

  if (candidate.stock < policy.minimumCampaignStock) {
    return {
      ...base,
      state: "HOLD" as const,
      objective: "SALES" as const,
      reason:
        "No se recomienda promocionar: el stock no alcanza el mínimo definido.",
      suggestedBudget: 0,
      brief: "Repón inventario antes de invertir en difusión.",
    };
  }

  if (
    candidate.riskState === "CRITICAL" ||
    candidate.riskState === "WARNING" ||
    (candidate.daysUntilStockout !== null &&
      candidate.daysUntilStockout < policy.minimumCampaignDaysCover)
  ) {
    return {
      ...base,
      state: "HOLD" as const,
      objective: "SALES" as const,
      reason:
        "No se recomienda promocionar: el inventario puede agotarse pronto.",
      suggestedBudget: 0,
      brief: "Asegura la reposición antes de aumentar la demanda.",
    };
  }

  if (candidate.acquisitionCost === null || candidate.acquisitionCost <= 0) {
    return {
      ...base,
      state: "HOLD" as const,
      objective: "SALES" as const,
      reason:
        "Falta el costo de compra; no es posible revisar el margen con seguridad.",
      suggestedBudget: 0,
      brief: "Registra el costo del producto antes de invertir en pauta.",
    };
  }

  if (candidate.imageCount === 0 || candidate.descriptionLength < 60) {
    return {
      ...base,
      state: "HOLD" as const,
      objective: "TRAFFIC" as const,
      reason:
        "La ficha necesita mejores fotos o descripción antes de atraer visitas pagadas.",
      suggestedBudget: 0,
      brief: "Completa la ficha y crea contenido claro antes de promocionarla.",
    };
  }

  if (
    candidate.profitMarginPct === null ||
    candidate.profitMarginPct < policy.minimumCampaignMarginPct
  ) {
    return {
      ...base,
      state: "ORGANIC_FIRST" as const,
      objective: "TRAFFIC" as const,
      reason:
        "El margen no alcanza el mínimo para pauta pagada; prueba contenido orgánico primero.",
      suggestedBudget: 0,
      brief:
        "Publica un video corto o carrusel y mide interés sin inversión publicitaria.",
    };
  }

  if (candidate.totalQuantitySold <= 0 || candidate.isDeadStock) {
    return {
      ...base,
      state: "ORGANIC_FIRST" as const,
      objective: "TRAFFIC" as const,
      reason:
        "El producto tiene margen y stock, pero aún no demuestra conversión reciente.",
      suggestedBudget: 0,
      brief:
        "Prueba contenido orgánico con una propuesta visual y CTA hacia la tienda.",
    };
  }

  return {
    ...base,
    state: "READY_TO_TEST" as const,
    objective: "SALES" as const,
    reason:
      "Tiene margen, stock, ficha completa y ventas recientes para una prueba controlada.",
    suggestedBudget: 0,
    brief:
      "Muestra el producto en uso, destaca un beneficio concreto y dirige a comprar en la tienda.",
  };
}

export function recommendSocialCampaigns({
  candidates,
  policy,
  testBudget,
  limit = 8,
}: {
  candidates: CampaignCandidate[];
  policy: BusinessCashPolicyInput;
  testBudget: number;
  limit?: number;
}): CampaignRecommendation[] {
  validateBusinessCashPolicy(policy);

  const recommendations = candidates
    .map((candidate) => ({
      candidate,
      recommendation: recommendationFor(candidate, policy),
    }))
    .sort((first, second) => {
      const stateWeight: Record<CampaignRecommendationState, number> = {
        READY_TO_TEST: 0,
        ORGANIC_FIRST: 1,
        HOLD: 2,
      };
      const stateDifference =
        stateWeight[first.recommendation.state] -
        stateWeight[second.recommendation.state];
      if (stateDifference !== 0) return stateDifference;
      return second.candidate.totalProfit - first.candidate.totalProfit;
    })
    .slice(0, limit);
  const paidTests = recommendations.filter(
    ({ recommendation }) => recommendation.state === "READY_TO_TEST",
  );
  const suggestedBudget =
    paidTests.length > 0
      ? Math.floor(nonNegative(testBudget) / paidTests.length / 100) * 100
      : 0;

  return recommendations.map(({ recommendation }) =>
    recommendation.state === "READY_TO_TEST"
      ? { ...recommendation, suggestedBudget }
      : recommendation,
  );
}
