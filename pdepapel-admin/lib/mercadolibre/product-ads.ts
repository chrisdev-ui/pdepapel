import { mutateMercadoLibreJson, requestMercadoLibreJson } from "./client";

const PRODUCT_ADS_METRICS = [
  "clicks",
  "prints",
  "ctr",
  "cost",
  "cpc",
  "acos",
  "roas",
  "cvr",
  "total_amount",
  "units_quantity",
] as const;
const PRODUCT_ADS_HEADERS: Record<string, string> = { "api-version": "2" };
const ADVERTISERS_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "api-version": "1",
};

type MercadoLibreJsonResponse = {
  ok: boolean;
  status: number;
  payload: unknown;
};

type MercadoLibreJsonRequester = (
  connectionId: string,
  resource: string,
  request?: typeof fetch,
  headers?: Record<string, string>,
) => Promise<MercadoLibreJsonResponse>;

type ProductAdsMetrics = {
  clicks: number;
  prints: number;
  cost: number;
  cpc: number | null;
  ctr: number | null;
  acos: number | null;
  roas: number | null;
  cvr: number | null;
  totalAmount: number;
  unitsQuantity: number;
};

export const PRODUCT_ADS_STRATEGIES = [
  "profitability",
  "increase",
  "visibility",
] as const;

export type MercadoLibreProductAdsStrategy =
  (typeof PRODUCT_ADS_STRATEGIES)[number];

export type MercadoLibreProductAdsCampaignUpdate = {
  status?: "active" | "paused";
  budget?: number;
  roasTarget?: number;
  strategy?: MercadoLibreProductAdsStrategy;
};

export type MercadoLibreProductAdsOverview =
  | {
      state: "READY";
      advertiser: { id: string; name: string | null };
      range: { from: string; to: string };
      currencyId: string;
      totalCampaigns: number;
      campaigns: Array<{
        id: string;
        name: string;
        status: string | null;
        budget: number | null;
        dailyBudget: number | null;
        roasTarget: number | null;
        strategy: MercadoLibreProductAdsStrategy | null;
        automaticBudget: boolean | null;
        lastUpdated: string | null;
        metrics: ProductAdsMetrics;
      }>;
      summary: ProductAdsMetrics;
    }
  | {
      state: "NOT_ENABLED";
      message: string;
    }
  | {
      state: "REAUTH_REQUIRED";
      message: string;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getNumberOrZero(value: unknown) {
  return getNumber(value) ?? 0;
}

function getProductAdsStrategy(
  value: unknown,
): MercadoLibreProductAdsStrategy | null {
  const strategy = getString(value)?.toLowerCase();
  return strategy && PRODUCT_ADS_STRATEGIES.includes(strategy as never)
    ? (strategy as MercadoLibreProductAdsStrategy)
    : null;
}

function formatBogotaDate(date: Date) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = new Map(values.map((part) => [part.type, part.value]));

  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

export function getProductAdsDateRange(now = new Date()) {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 29);

  return {
    from: formatBogotaDate(from),
    to: formatBogotaDate(to),
  };
}

function parseMetrics(value: unknown): ProductAdsMetrics {
  const metrics = asRecord(value);
  const clicks = getNumberOrZero(metrics?.clicks);
  const prints = getNumberOrZero(metrics?.prints);
  const cost = getNumberOrZero(metrics?.cost);
  const totalAmount = getNumberOrZero(metrics?.total_amount);

  return {
    clicks,
    prints,
    cost,
    cpc: getNumber(metrics?.cpc) ?? (clicks > 0 ? cost / clicks : null),
    ctr:
      getNumber(metrics?.ctr) ?? (prints > 0 ? (clicks / prints) * 100 : null),
    acos:
      getNumber(metrics?.acos) ??
      (totalAmount > 0 ? (cost / totalAmount) * 100 : null),
    roas: getNumber(metrics?.roas) ?? (cost > 0 ? totalAmount / cost : null),
    cvr: getNumber(metrics?.cvr),
    totalAmount,
    unitsQuantity: getNumberOrZero(metrics?.units_quantity),
  };
}

function sumCampaignMetrics(campaigns: Array<{ metrics: ProductAdsMetrics }>) {
  const totals = campaigns.reduce(
    (current, campaign) => ({
      clicks: current.clicks + campaign.metrics.clicks,
      prints: current.prints + campaign.metrics.prints,
      cost: current.cost + campaign.metrics.cost,
      totalAmount: current.totalAmount + campaign.metrics.totalAmount,
      unitsQuantity: current.unitsQuantity + campaign.metrics.unitsQuantity,
    }),
    {
      clicks: 0,
      prints: 0,
      cost: 0,
      totalAmount: 0,
      unitsQuantity: 0,
    },
  );

  return parseMetrics({
    ...totals,
    cpc: totals.clicks > 0 ? totals.cost / totals.clicks : null,
    ctr: totals.prints > 0 ? (totals.clicks / totals.prints) * 100 : null,
    acos:
      totals.totalAmount > 0 ? (totals.cost / totals.totalAmount) * 100 : null,
    roas: totals.cost > 0 ? totals.totalAmount / totals.cost : null,
  });
}

function getUnavailableState(
  status: number,
): MercadoLibreProductAdsOverview | null {
  if (status === 401) {
    return {
      state: "REAUTH_REQUIRED",
      message:
        "Mercado Libre pidió una nueva autorización. Reconecta la cuenta antes de consultar Product Ads.",
    };
  }

  if (status === 403 || status === 404) {
    return {
      state: "NOT_ENABLED",
      message:
        "Product Ads aún no está disponible para esta conexión. Activa Publicidad en Mercado Libre, concede el permiso de publicidad y reconecta la cuenta.",
    };
  }

  return null;
}

function getCurrencyId(value: unknown) {
  const currency = getString(value)?.toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : "COP";
}

export async function getMercadoLibreProductAdsOverview({
  connectionId,
  siteId,
  now = new Date(),
  requestJson = requestMercadoLibreJson,
}: {
  connectionId: string;
  siteId: string;
  now?: Date;
  requestJson?: MercadoLibreJsonRequester;
}): Promise<MercadoLibreProductAdsOverview> {
  const advertisersResponse = await requestJson(
    connectionId,
    "/advertising/advertisers?product_id=PADS",
    undefined,
    ADVERTISERS_HEADERS,
  );
  const advertisersUnavailable = getUnavailableState(
    advertisersResponse.status,
  );
  if (advertisersUnavailable) return advertisersUnavailable;
  if (!advertisersResponse.ok) {
    throw new Error(
      `No fue posible consultar anunciantes de Product Ads (${advertisersResponse.status})`,
    );
  }

  const advertiserPayload = asRecord(advertisersResponse.payload);
  const advertiser = Array.isArray(advertiserPayload?.advertisers)
    ? advertiserPayload.advertisers
        .map(asRecord)
        .find((candidate) => getString(candidate?.site_id) === siteId)
    : null;
  const advertiserId =
    getString(advertiser?.advertiser_id) ??
    (typeof advertiser?.advertiser_id === "number"
      ? String(advertiser.advertiser_id)
      : null);

  if (!advertiserId) {
    return {
      state: "NOT_ENABLED",
      message:
        "Mercado Libre no reportó una cuenta de Product Ads para Colombia. Activa Publicidad en tu cuenta antes de volver a intentar.",
    };
  }

  const range = getProductAdsDateRange(now);
  const search = new URLSearchParams({
    limit: "50",
    offset: "0",
    date_from: range.from,
    date_to: range.to,
    metrics: PRODUCT_ADS_METRICS.join(","),
    metrics_summary: "true",
  });
  const campaignsResponse = await requestJson(
    connectionId,
    `/advertising/${encodeURIComponent(siteId)}/advertisers/${encodeURIComponent(advertiserId)}/product_ads/campaigns/search?${search.toString()}`,
    undefined,
    PRODUCT_ADS_HEADERS,
  );
  const campaignsUnavailable = getUnavailableState(campaignsResponse.status);
  if (campaignsUnavailable) return campaignsUnavailable;
  if (!campaignsResponse.ok) {
    throw new Error(
      `No fue posible consultar campañas de Product Ads (${campaignsResponse.status})`,
    );
  }

  const payload = asRecord(campaignsResponse.payload);
  const campaigns = Array.isArray(payload?.results)
    ? payload.results.map(asRecord).flatMap((campaign) => {
        const id =
          getString(campaign?.id) ??
          (typeof campaign?.id === "number" ? String(campaign.id) : null);
        if (!id) return [];

        return [
          {
            id,
            name: getString(campaign?.name) ?? `Campaña ${id}`,
            status: getString(campaign?.status),
            budget: getNumber(campaign?.budget),
            dailyBudget: getNumber(campaign?.daily_budget),
            roasTarget: getNumber(campaign?.roas_target),
            strategy: getProductAdsStrategy(campaign?.strategy),
            automaticBudget:
              typeof campaign?.automatic_budget === "boolean"
                ? campaign.automatic_budget
                : null,
            lastUpdated: getString(campaign?.last_updated),
            metrics: parseMetrics(campaign?.metrics),
          },
        ];
      })
    : [];
  const paging = asRecord(payload?.paging);
  const summary = payload?.metrics_summary
    ? parseMetrics(payload.metrics_summary)
    : sumCampaignMetrics(campaigns);
  const firstCampaignPayload = Array.isArray(payload?.results)
    ? asRecord(payload.results[0])
    : null;

  return {
    state: "READY",
    advertiser: {
      id: advertiserId,
      name:
        getString(advertiser?.advertiser_name) ??
        getString(advertiser?.account_name),
    },
    range,
    currencyId: getCurrencyId(
      asRecord(payload?.metrics_summary)?.currency_id ??
        firstCampaignPayload?.currency_id,
    ),
    totalCampaigns: getNumberOrZero(paging?.total),
    campaigns,
    summary,
  };
}

export async function updateMercadoLibreProductAdsCampaign({
  connectionId,
  siteId,
  campaignId,
  update,
}: {
  connectionId: string;
  siteId: string;
  campaignId: string;
  update: MercadoLibreProductAdsCampaignUpdate;
}) {
  const body: Record<string, unknown> = {};
  if (update.status) body.status = update.status;
  if (update.budget !== undefined) body.budget = update.budget;
  if (update.roasTarget !== undefined) body.roas_target = update.roasTarget;
  if (update.strategy) body.strategy = update.strategy;
  if (Object.keys(body).length === 0) {
    throw new Error("Define al menos un cambio para la campaña");
  }

  return mutateMercadoLibreJson(
    connectionId,
    `/marketplace/advertising/${encodeURIComponent(siteId)}/product_ads/campaigns/${encodeURIComponent(campaignId)}`,
    { method: "PUT", body, headers: PRODUCT_ADS_HEADERS },
  );
}
