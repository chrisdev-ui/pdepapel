import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { getMercadoLibreJson, getMercadoLibreResource } from "./client";
import {
  getEffectiveMercadoLibreShipmentStatus,
  normalizeMercadoLibreShipmentStatus,
  SETTLED_MERCADOLIBRE_SHIPMENT_STATUSES,
} from "./logistics-status";
export {
  getEffectiveMercadoLibreShipmentStatus,
  getClaimStatusMeta,
  isMercadoLibreShipmentAwaitingDispatch,
  isMercadoLibreShipmentSettled,
  normalizeMercadoLibreShipmentStatus,
  getShipmentStatusMeta,
  SHIPMENT_STATUS_META,
} from "./logistics-status";

type MercadoLibreShipment = {
  externalShipmentId: string;
  status: string;
  substatus: string | null;
  logisticsType: string | null;
  trackingNumber: string | null;
  lastRemoteUpdateAt: Date | null;
  metadata: Record<string, unknown>;
};

type MercadoLibreClaim = {
  externalClaimId: string;
  externalOrderId: string | null;
  status: string;
  stage: string | null;
  type: string | null;
  reasonId: string | null;
  title: string | null;
  dueAt: Date | null;
  lastRemoteUpdateAt: Date | null;
  metadata: Prisma.InputJsonValue;
};

function getString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getDate(value: unknown) {
  const text = getString(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getLocationName(value: unknown) {
  const record = getRecord(value);
  return getString(record?.name) ?? getString(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function getMercadoLibreShipmentOrderIds(payload: unknown) {
  const items = Array.isArray(payload)
    ? payload
    : (() => {
        const record = getRecord(payload);
        return Array.isArray(record?.items) ? record.items : [];
      })();

  return Array.from(
    new Set(
      items.flatMap((item) => {
        const orderId = getString(getRecord(item)?.order_id);
        return orderId ? [orderId] : [];
      }),
    ),
  );
}

async function resolveMercadoLibreShipmentOrder(
  connectionId: string,
  externalShipmentId: string,
) {
  try {
    const items = await getMercadoLibreJson(
      connectionId,
      `/shipments/${encodeURIComponent(externalShipmentId)}/items`,
    );
    const externalOrderIds = getMercadoLibreShipmentOrderIds(items);

    if (externalOrderIds.length !== 1) {
      return { externalOrderIds, marketplaceOrder: null };
    }

    const marketplaceOrder = await prismadb.marketplaceOrder.findFirst({
      where: {
        connectionId,
        externalOrderId: externalOrderIds[0],
      },
      select: { id: true, status: true },
    });

    return {
      externalOrderIds,
      marketplaceOrder,
    };
  } catch (error) {
    console.warn("Mercado Libre shipment order lookup failed", {
      externalShipmentId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return { externalOrderIds: [], marketplaceOrder: null };
  }
}

export function parseMercadoLibreShipment(
  payload: Record<string, unknown>,
): MercadoLibreShipment {
  const externalShipmentId = getString(payload.id);
  if (!externalShipmentId) {
    throw new Error("Mercado Libre devolvió un envío inválido");
  }
  const destination = getRecord(payload.destination);
  const address = getRecord(destination?.shipping_address);

  return {
    externalShipmentId,
    status: normalizeMercadoLibreShipmentStatus(
      getString(payload.status) ?? "unknown",
    ),
    substatus: getString(payload.substatus)?.toLowerCase() ?? null,
    logisticsType: getString(payload.logistic_type) ?? null,
    trackingNumber: getString(payload.tracking_number) ?? null,
    lastRemoteUpdateAt: getDate(payload.last_updated),
    metadata: {
      destinationCity: getLocationName(address?.city),
      destinationState: getLocationName(address?.state),
      dateCreated: getString(payload.date_created),
    },
  };
}

export async function synchronizeMercadoLibreShipment(
  connectionId: string,
  payload: Record<string, unknown>,
) {
  const shipment = parseMercadoLibreShipment(payload);
  const orderLink = await resolveMercadoLibreShipmentOrder(
    connectionId,
    shipment.externalShipmentId,
  );
  const marketplaceOrderData = orderLink.marketplaceOrder
    ? { marketplaceOrderId: orderLink.marketplaceOrder.id }
    : {};
  const status = getEffectiveMercadoLibreShipmentStatus(
    shipment.status,
    orderLink.marketplaceOrder?.status,
  );
  const metadata = toJsonValue({
    ...shipment.metadata,
    externalOrderIds: orderLink.externalOrderIds,
  });

  return prismadb.marketplaceShipment.upsert({
    where: {
      connectionId_externalShipmentId: {
        connectionId,
        externalShipmentId: shipment.externalShipmentId,
      },
    },
    update: {
      ...marketplaceOrderData,
      status,
      substatus: shipment.substatus,
      logisticsType: shipment.logisticsType,
      trackingNumber: shipment.trackingNumber,
      lastRemoteUpdateAt: shipment.lastRemoteUpdateAt,
      metadata,
    },
    create: {
      connectionId,
      marketplaceOrderId: orderLink.marketplaceOrder?.id ?? null,
      externalShipmentId: shipment.externalShipmentId,
      status,
      substatus: shipment.substatus,
      logisticsType: shipment.logisticsType,
      trackingNumber: shipment.trackingNumber,
      lastRemoteUpdateAt: shipment.lastRemoteUpdateAt,
      metadata,
    },
  });
}

const MAX_SHIPMENTS_PER_REFRESH = 25;

/**
 * Re-reads shipments from Mercado Libre and re-synchronizes them.
 *
 * Shipment status is otherwise only ever written by the webhook processor, so a
 * notification that never arrived — or that failed — leaves the panel showing a
 * stale state with no way to recover. This is the manual pull path, mirroring
 * the one questions already have.
 *
 * Pass an `externalShipmentId` to refresh a single shipment; without it, every
 * shipment that can still change is refreshed, newest first and capped, so one
 * click cannot exhaust the Mercado Libre rate limit.
 */
export async function refreshMercadoLibreShipments(
  connectionId: string,
  externalShipmentId?: string,
) {
  const shipments = await prismadb.marketplaceShipment.findMany({
    where: {
      connectionId,
      ...(externalShipmentId
        ? { externalShipmentId }
        : { status: { notIn: SETTLED_MERCADOLIBRE_SHIPMENT_STATUSES } }),
    },
    select: { externalShipmentId: true, status: true },
    orderBy: { lastRemoteUpdateAt: "desc" },
    take: externalShipmentId ? 1 : MAX_SHIPMENTS_PER_REFRESH,
  });

  if (externalShipmentId && shipments.length === 0) {
    throw new Error("Ese envío no existe en P de Papel");
  }

  let updated = 0;
  const failures: { externalShipmentId: string; message: string }[] = [];
  for (const shipment of shipments) {
    // A single shipment is refreshed on explicit request even when settled; a
    // bulk refresh already filtered those out.
    try {
      const payload = await getMercadoLibreResource(
        connectionId,
        `/shipments/${encodeURIComponent(shipment.externalShipmentId)}`,
      );
      await synchronizeMercadoLibreShipment(connectionId, payload);
      updated += 1;
    } catch (error) {
      failures.push({
        externalShipmentId: shipment.externalShipmentId,
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return {
    requested: shipments.length,
    updated,
    failures,
    reachedLimit:
      !externalShipmentId && shipments.length === MAX_SHIPMENTS_PER_REFRESH,
  };
}

export function parseMercadoLibreClaim(
  payload: Record<string, unknown>,
): MercadoLibreClaim {
  const externalClaimId = getString(payload.id);
  if (!externalClaimId) {
    throw new Error("Mercado Libre devolvió un reclamo inválido");
  }
  const detail = getRecord(payload.detail);

  return {
    externalClaimId,
    externalOrderId: getString(payload.resource_id),
    status: getString(payload.status)?.toLowerCase() ?? "unknown",
    stage: getString(payload.stage)?.toLowerCase() ?? null,
    type: getString(payload.type)?.toLowerCase() ?? null,
    reasonId: getString(payload.reason_id),
    title: getString(detail?.title) ?? getString(payload.title),
    dueAt: getDate(detail?.due_date) ?? getDate(payload.due_date),
    lastRemoteUpdateAt: getDate(payload.last_updated),
    metadata: toJsonValue({
      resolution: getRecord(payload.resolution),
      actionResponsible: getString(detail?.action_responsible),
      description: getString(detail?.description),
    }),
  };
}

export async function synchronizeMercadoLibreClaim(
  connectionId: string,
  payload: Record<string, unknown>,
) {
  const claim = parseMercadoLibreClaim(payload);
  const marketplaceOrder = claim.externalOrderId
    ? await prismadb.marketplaceOrder.findFirst({
        where: { connectionId, externalOrderId: claim.externalOrderId },
        select: { id: true },
      })
    : null;

  return prismadb.marketplaceClaim.upsert({
    where: {
      connectionId_externalClaimId: {
        connectionId,
        externalClaimId: claim.externalClaimId,
      },
    },
    update: {
      marketplaceOrderId: marketplaceOrder?.id ?? null,
      externalOrderId: claim.externalOrderId,
      status: claim.status,
      stage: claim.stage,
      type: claim.type,
      reasonId: claim.reasonId,
      title: claim.title,
      dueAt: claim.dueAt,
      lastRemoteUpdateAt: claim.lastRemoteUpdateAt,
      metadata: claim.metadata,
    },
    create: {
      connectionId,
      marketplaceOrderId: marketplaceOrder?.id ?? null,
      externalClaimId: claim.externalClaimId,
      externalOrderId: claim.externalOrderId,
      status: claim.status,
      stage: claim.stage,
      type: claim.type,
      reasonId: claim.reasonId,
      title: claim.title,
      dueAt: claim.dueAt,
      lastRemoteUpdateAt: claim.lastRemoteUpdateAt,
      metadata: claim.metadata,
    },
  });
}
