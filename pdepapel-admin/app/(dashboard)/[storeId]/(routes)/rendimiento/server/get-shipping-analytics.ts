import "server-only";

import { shippingOptions } from "@/constants";
import {
  getBusinessGrowthPeriodRange,
  getPreviousBusinessGrowthPeriodRange,
  type BusinessGrowthPeriodSelection,
} from "@/lib/business-growth-period";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { ShippingStatus } from "@prisma/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Los envíos del mes que se está mirando.
 *
 * Dos cosas que este cargador hacía y ya no:
 *
 * 1. Llevaba `"use server"`. Eso no lo convierte en «código de servidor»: lo
 *    publica como acción, un endpoint POST que cualquiera puede invocar. La
 *    guardia lo protegía, pero una lectura de página no tiene por qué exponer
 *    una superficie de escritura. `server-only` es lo que de verdad se quería.
 * 2. Traía TODOS los envíos de la historia, sin `take` ni rango, para sacar
 *    ocho números. Con 418 envíos no se nota; con 4.000 sí, y la pantalla
 *    entera espera por ello.
 *
 * Ahora se acota al mes. El total histórico y el mes anterior salen de dos
 * `count`, que no traen filas.
 */

const ACTIVE_STATUSES: ShippingStatus[] = [
  ShippingStatus.Preparing,
  ShippingStatus.Shipped,
  ShippingStatus.PickedUp,
  ShippingStatus.InTransit,
  ShippingStatus.OutForDelivery,
];

const TROUBLE_STATUSES: ShippingStatus[] = [
  ShippingStatus.FailedDelivery,
  ShippingStatus.Returned,
  ShippingStatus.Exception,
];

/** Cómo se agrupan los diez estados para que quepan en una lectura. */
const STATUS_GROUPS = [
  {
    id: "entregados",
    label: "Entregados",
    tint: "mint",
    statuses: [ShippingStatus.Delivered],
  },
  {
    id: "en-camino",
    label: "En camino",
    tint: "sky",
    statuses: [
      ShippingStatus.Shipped,
      ShippingStatus.PickedUp,
      ShippingStatus.InTransit,
      ShippingStatus.OutForDelivery,
    ],
  },
  {
    id: "por-despachar",
    label: "Por despachar",
    tint: "lavender",
    statuses: [ShippingStatus.Preparing],
  },
  {
    id: "con-novedad",
    label: "Devueltos o con novedad",
    tint: "pink",
    statuses: TROUBLE_STATUSES,
  },
  {
    id: "cancelados",
    label: "Cancelados",
    tint: "slate",
    statuses: [ShippingStatus.Cancelled],
  },
] as const;

export interface ShippingAnalytics {
  period: { label: string; isCurrent: boolean };
  totalShipments: number;
  previousTotalShipments: number;
  changeVsPreviousPct: number | null;
  allTimeShipments: number;
  activeShipments: number;
  deliveredShipments: number;
  deliveryRate: number;
  troubleShipments: number;
  totalShippingCost: number;
  averageShippingCost: number;
  byStatusGroup: Array<{
    id: string;
    label: string;
    tint: string;
    count: number;
    sharePct: number;
    /** Los estados exactos que entraron en el grupo, para la ayuda al pasar. */
    detail: string;
  }>;
  topCarriers: Array<{
    carrier: string;
    count: number;
    averageCost: number | null;
  }>;
}

export async function getShippingAnalytics(
  storeId: string,
  period: BusinessGrowthPeriodSelection,
): Promise<ShippingAnalytics> {
  await requireStoreOwner(storeId);

  const label = format(
    new Date(period.year, period.month - 1, 1),
    "MMMM 'de' yyyy",
    { locale: es },
  );

  const { start, end } = getBusinessGrowthPeriodRange(period);
  const previous = getPreviousBusinessGrowthPeriodRange(period);

  const [shipments, allTimeShipments, previousTotalShipments] =
    await Promise.all([
      prismadb.shipping.findMany({
        where: { storeId, createdAt: { gte: start, lte: end } },
        select: {
          status: true,
          cost: true,
          carrierName: true,
          courier: true,
        },
      }),
      prismadb.shipping.count({ where: { storeId } }),
      prismadb.shipping.count({
        where: {
          storeId,
          createdAt: { gte: previous.start, lte: previous.end },
        },
      }),
    ]);

  const totalShipments = shipments.length;

  const byStatus = shipments.reduce<Partial<Record<ShippingStatus, number>>>(
    (acc, shipment) => {
      acc[shipment.status] = (acc[shipment.status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const countOf = (statuses: readonly ShippingStatus[]) =>
    statuses.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);

  const deliveredShipments = countOf([ShippingStatus.Delivered]);
  const activeShipments = countOf(ACTIVE_STATUSES);
  const troubleShipments = countOf(TROUBLE_STATUSES);

  const totalShippingCost = shipments.reduce(
    (sum, shipment) => sum + (shipment.cost || 0),
    0,
  );

  const carriers = shipments.reduce<
    Record<string, { count: number; cost: number; priced: number }>
  >((acc, shipment) => {
    const carrier =
      shipment.carrierName || shipment.courier || "Entrega sin transportadora";
    const entry = (acc[carrier] ??= { count: 0, cost: 0, priced: 0 });
    entry.count += 1;
    if (shipment.cost) {
      entry.cost += shipment.cost;
      entry.priced += 1;
    }
    return acc;
  }, {});

  return {
    period: { label, isCurrent: period.isCurrent },
    totalShipments,
    previousTotalShipments,
    changeVsPreviousPct:
      previousTotalShipments > 0
        ? Math.round(
            ((totalShipments - previousTotalShipments) /
              previousTotalShipments) *
              100,
          )
        : null,
    allTimeShipments,
    activeShipments,
    deliveredShipments,
    deliveryRate:
      totalShipments > 0
        ? Math.round((deliveredShipments / totalShipments) * 1000) / 10
        : 0,
    troubleShipments,
    totalShippingCost: Math.round(totalShippingCost),
    averageShippingCost:
      totalShipments > 0 ? Math.round(totalShippingCost / totalShipments) : 0,
    byStatusGroup: STATUS_GROUPS.map((group) => {
      const count = countOf(group.statuses);
      return {
        id: group.id,
        label: group.label,
        tint: group.tint,
        count,
        sharePct:
          totalShipments > 0
            ? Math.round((count / totalShipments) * 1000) / 10
            : 0,
        detail: group.statuses
          .map((status) => shippingOptions[status])
          .join(", "),
      };
    }).filter((group) => group.count > 0),
    topCarriers: Object.entries(carriers)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([carrier, entry]) => ({
        carrier,
        count: entry.count,
        averageCost:
          entry.priced > 0 ? Math.round(entry.cost / entry.priced) : null,
      })),
  };
}
