import { MarketplaceOrderStatus, type Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import {
  getMercadoLibreOrderFinancials,
  MercadoLibreFinancialsPendingError,
} from "./order-financials";

type UnknownRecord = Record<string, unknown>;
const RELEASE_STATUS_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_RELEASE_STATUS_REFRESHES = 10;

type CashflowOrder = {
  id: string;
  externalOrderId: string;
  paidAt: Date | null;
  totalAmount: number | null;
  netAmount: number | null;
  metadata: Prisma.JsonValue | null;
};

export type MercadoLibreCashflowSummary = {
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

export type MercadoLibreCashflowRefreshResult = {
  checkedOrders: number;
  refreshedOrders: number;
  pendingOrders: number;
  failedOrders: number;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function getReleaseStatusCheckedAt(metadata: Prisma.JsonValue | null) {
  if (!isRecord(metadata) || !isRecord(metadata.financials)) return null;

  return parseReleaseDate(metadata.financials.releaseStatusCheckedAt);
}

export function needsMercadoLibreReleaseStatusRefresh(
  metadata: Prisma.JsonValue | null,
  now = new Date(),
) {
  const release = getMercadoLibreMoneyRelease(metadata);
  if (release.status === "released") return false;

  const checkedAt = getReleaseStatusCheckedAt(metadata);
  return (
    !checkedAt ||
    checkedAt.getTime() <= now.getTime() - RELEASE_STATUS_REFRESH_INTERVAL_MS
  );
}

export function mergeMercadoLibreReleaseStatus({
  metadata,
  moneyReleaseDate,
  moneyReleaseStatus,
  checkedAt = new Date(),
}: {
  metadata: Prisma.JsonValue | null;
  moneyReleaseDate: string | null;
  moneyReleaseStatus: string | null;
  checkedAt?: Date;
}): Prisma.InputJsonValue {
  const currentMetadata = isRecord(metadata) ? metadata : {};
  const currentFinancials = isRecord(currentMetadata.financials)
    ? currentMetadata.financials
    : {};

  return {
    ...currentMetadata,
    financials: {
      ...currentFinancials,
      source:
        getString(currentFinancials.source) ?? "MERCADOLIBRE_BILLING_STATUS",
      status: getString(currentFinancials.status) ?? "READY",
      moneyReleaseDate,
      moneyReleaseStatus,
      releaseStatusCheckedAt: checkedAt.toISOString(),
    },
  } as Prisma.InputJsonValue;
}

export function buildMercadoLibreCashflowSummary(
  orders: CashflowOrder[],
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

async function getMercadoLibreCashflowOrders(connectionId: string) {
  return prismadb.marketplaceOrder.findMany({
    where: {
      connectionId,
      status: MarketplaceOrderStatus.PAID,
    },
    select: {
      id: true,
      externalOrderId: true,
      paidAt: true,
      totalAmount: true,
      netAmount: true,
      metadata: true,
    },
  });
}

export async function refreshMercadoLibreCashflowReleaseStatuses(
  connectionId: string,
  now = new Date(),
): Promise<MercadoLibreCashflowRefreshResult> {
  const orders = await getMercadoLibreCashflowOrders(connectionId);
  const candidates = orders
    .filter(
      (order) =>
        order.netAmount !== null &&
        order.totalAmount !== null &&
        needsMercadoLibreReleaseStatusRefresh(order.metadata, now),
    )
    .sort(
      (first, second) =>
        (first.paidAt?.getTime() ?? 0) - (second.paidAt?.getTime() ?? 0),
    )
    .slice(0, MAX_RELEASE_STATUS_REFRESHES);

  const result: MercadoLibreCashflowRefreshResult = {
    checkedOrders: candidates.length,
    refreshedOrders: 0,
    pendingOrders: 0,
    failedOrders: 0,
  };

  for (const order of candidates) {
    try {
      const financials = await getMercadoLibreOrderFinancials(
        connectionId,
        order.externalOrderId,
        order.totalAmount!,
      );
      await prismadb.marketplaceOrder.update({
        where: { id: order.id },
        data: {
          metadata: mergeMercadoLibreReleaseStatus({
            metadata: order.metadata,
            moneyReleaseDate: financials.moneyReleaseDate,
            moneyReleaseStatus: financials.moneyReleaseStatus,
            checkedAt: now,
          }),
        },
      });
      result.refreshedOrders += 1;
    } catch (error) {
      if (error instanceof MercadoLibreFinancialsPendingError) {
        result.pendingOrders += 1;
      } else {
        result.failedOrders += 1;
      }
    }
  }

  return result;
}

export async function getMercadoLibreCashflowSummary(connectionId: string) {
  const orders = await getMercadoLibreCashflowOrders(connectionId);
  return buildMercadoLibreCashflowSummary(orders);
}
