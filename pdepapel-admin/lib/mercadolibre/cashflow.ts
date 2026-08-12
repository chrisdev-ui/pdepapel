import { MarketplaceOrderStatus, type Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { requestMercadoLibreJson } from "./client";

type UnknownRecord = Record<string, unknown>;

type CashflowOrder = {
  id: string;
  externalOrderId: string;
  paidAt: Date | null;
  netAmount: number | null;
  metadata: Prisma.JsonValue | null;
};

export type MercadoLibreAccountBalance =
  | {
      state: "AVAILABLE";
      availableBalance: number;
      totalAmount: number | null;
      unavailableBalance: number | null;
    }
  | {
      state: "UNAVAILABLE";
      reason: "UNSUPPORTED" | "TEMPORARY" | "INVALID_RESPONSE";
    };

export type MercadoLibreCashflowSummary = {
  accountBalance: MercadoLibreAccountBalance;
  awaitingRelease: {
    amount: number;
    orders: number;
  };
  settlementPending: {
    orders: number;
  };
  releaseStatusUnknown: {
    orders: number;
  };
  upcomingReleases: {
    marketplaceOrderId: string;
    externalOrderId: string;
    netAmount: number;
    paidAt: Date | null;
    releaseDate: Date;
  }[];
  updatedAt: Date;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getFiniteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseReleaseDate(value: unknown) {
  const rawDate = getString(value);
  if (!rawDate) return null;

  const parsedDate = new Date(rawDate);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function getMercadoLibreMoneyRelease(metadata: Prisma.JsonValue | null) {
  if (!isRecord(metadata) || !isRecord(metadata.financials)) {
    return { status: null, releaseDate: null };
  }

  return {
    status:
      getString(metadata.financials.moneyReleaseStatus)?.toLowerCase() ?? null,
    releaseDate: parseReleaseDate(metadata.financials.moneyReleaseDate),
  };
}

export function buildMercadoLibreCashflowSummary(
  orders: CashflowOrder[],
  accountBalance: MercadoLibreAccountBalance,
  now = new Date(),
): MercadoLibreCashflowSummary {
  let awaitingReleaseAmount = 0;
  let awaitingReleaseOrders = 0;
  let settlementPendingOrders = 0;
  let releaseStatusUnknownOrders = 0;
  const upcomingReleases: MercadoLibreCashflowSummary["upcomingReleases"] = [];

  for (const order of orders) {
    if (order.netAmount === null) {
      settlementPendingOrders += 1;
      continue;
    }

    const release = getMercadoLibreMoneyRelease(order.metadata);
    if (release.status === "released") continue;

    if (!release.status) {
      releaseStatusUnknownOrders += 1;
      continue;
    }

    awaitingReleaseAmount += order.netAmount;
    awaitingReleaseOrders += 1;

    if (release.releaseDate && release.releaseDate.getTime() >= now.getTime()) {
      upcomingReleases.push({
        marketplaceOrderId: order.id,
        externalOrderId: order.externalOrderId,
        netAmount: order.netAmount,
        paidAt: order.paidAt,
        releaseDate: release.releaseDate,
      });
    }
  }

  return {
    accountBalance,
    awaitingRelease: {
      amount: awaitingReleaseAmount,
      orders: awaitingReleaseOrders,
    },
    settlementPending: { orders: settlementPendingOrders },
    releaseStatusUnknown: { orders: releaseStatusUnknownOrders },
    upcomingReleases: upcomingReleases
      .sort(
        (first, second) =>
          first.releaseDate.getTime() - second.releaseDate.getTime(),
      )
      .slice(0, 6),
    updatedAt: now,
  };
}

export function parseMercadoLibreAccountBalance(
  payload: unknown,
): MercadoLibreAccountBalance {
  if (!isRecord(payload)) {
    return { state: "UNAVAILABLE", reason: "INVALID_RESPONSE" };
  }

  const availableBalance = getFiniteNumber(payload.available_balance);
  if (availableBalance === null) {
    return { state: "UNAVAILABLE", reason: "INVALID_RESPONSE" };
  }

  return {
    state: "AVAILABLE",
    availableBalance,
    totalAmount: getFiniteNumber(payload.total_amount),
    unavailableBalance: getFiniteNumber(payload.unavailable_balance),
  };
}

export async function getMercadoLibreAccountBalance({
  connectionId,
  sellerId,
}: {
  connectionId: string;
  sellerId: string | null;
}): Promise<MercadoLibreAccountBalance> {
  if (!sellerId) {
    return { state: "UNAVAILABLE", reason: "INVALID_RESPONSE" };
  }

  const response = await requestMercadoLibreJson(
    connectionId,
    `/users/${encodeURIComponent(sellerId)}/mercadopago_account/balance`,
  );

  if (!response.ok) {
    return {
      state: "UNAVAILABLE",
      reason:
        response.status === 400 ||
        response.status === 403 ||
        response.status === 404
          ? "UNSUPPORTED"
          : "TEMPORARY",
    };
  }

  return parseMercadoLibreAccountBalance(response.payload);
}

export async function getMercadoLibreCashflowSummary({
  connectionId,
  sellerId,
}: {
  connectionId: string;
  sellerId: string | null;
}) {
  const [orders, accountBalance] = await Promise.all([
    prismadb.marketplaceOrder.findMany({
      where: {
        connectionId,
        status: MarketplaceOrderStatus.PAID,
      },
      select: {
        id: true,
        externalOrderId: true,
        paidAt: true,
        netAmount: true,
        metadata: true,
      },
    }),
    getMercadoLibreAccountBalance({ connectionId, sellerId }).catch(() => ({
      state: "UNAVAILABLE" as const,
      reason: "TEMPORARY" as const,
    })),
  ]);

  return buildMercadoLibreCashflowSummary(orders, accountBalance);
}
