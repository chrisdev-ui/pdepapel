import type { FairEventStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import {
  DEFAULT_FAIR_VIEW,
  fairViewStatuses,
  isFairView,
  type FairView,
} from "@/lib/fair-phases";
import { requireStoreRead } from "@/lib/store-access";

/** Una tarjeta de la lista de ferias. */
export interface FairEventSummary {
  id: string;
  name: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: FairEventStatus;
  totalAllocated: number;
  totalSold: number;
  salesTotal: number;
  capsules: number;
}

/** Cuántas ferias caen en cada pestaña, para los contadores. */
export interface FairViewCounts {
  activas: number;
  cerradas: number;
  todas: number;
}

/**
 * Las cuatro cifras de la cabecera. Se calculan siempre sobre las ferias sin
 * cerrar, no sobre la pestaña abierta: si cambiaran al pasar de «Activas» a
 * «Todas» dirían cosas distintas con la misma etiqueta.
 */
export interface FairMetrics {
  openFairs: number;
  unitsOut: number;
  soldValue: number;
  awaitingReconciliation: number;
}

export interface FairEventsPage {
  view: FairView;
  counts: FairViewCounts;
  metrics: FairMetrics;
  fairs: FairEventSummary[];
}

/**
 * La lista de ferias, ya filtrada por la vista y con los totales sumados en la
 * base.
 *
 * Antes se traían **todas** las ferias con **todos** sus renglones de
 * inventario y **todos** sus pedidos, y se sumaba en memoria: una tienda con
 * historial acababa cargando miles de filas para pintar cuatro cifras por
 * tarjeta. Ahora la vista acota el `where` y los totales salen de tres
 * `groupBy`.
 */
export async function getFairEvents(
  storeId: string,
  requestedView?: string | null,
): Promise<FairEventsPage> {
  await requireStoreRead(storeId);

  const view: FairView = isFairView(requestedView) ? requestedView : DEFAULT_FAIR_VIEW;
  const statuses = fairViewStatuses(view);

  const [fairs, byStatus] = await Promise.all([
    prismadb.fairEvent.findMany({
      where: { storeId, ...(statuses ? { status: { in: statuses } } : {}) },
      select: {
        id: true,
        name: true,
        location: true,
        startsAt: true,
        endsAt: true,
        status: true,
        _count: { select: { capsules: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    // Los contadores de las pestañas no dependen de la vista abierta.
    prismadb.fairEvent.groupBy({
      by: ["status"],
      where: { storeId },
      _count: { _all: true },
    }),
  ]);

  const ids = fairs.map((fair) => fair.id);
  const [allocations, sales] = await Promise.all([
    ids.length
      ? prismadb.fairEventInventoryItem.groupBy({
          by: ["fairEventId"],
          where: { fairEventId: { in: ids } },
          _sum: { allocatedQuantity: true, soldQuantity: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prismadb.order.groupBy({
          by: ["fairEventId"],
          where: { fairEventId: { in: ids } },
          _sum: { total: true },
        })
      : Promise.resolve([]),
  ]);

  const allocationBy = new Map(allocations.map((row) => [row.fairEventId, row._sum]));
  const salesBy = new Map(sales.map((row) => [row.fairEventId, row._sum]));

  // Cifras de cabecera: siempre sobre las ferias sin cerrar.
  const activeStatuses = fairViewStatuses("activas") ?? [];
  const activeFairs = await prismadb.fairEvent.findMany({
    where: { storeId, status: { in: activeStatuses } },
    select: { id: true, status: true },
  });
  const activeIds = activeFairs.map((fair) => fair.id);
  const [activeAllocations, activeSales] = await Promise.all([
    activeIds.length
      ? prismadb.fairEventInventoryItem.groupBy({
          by: ["fairEventId"],
          where: { fairEventId: { in: activeIds } },
          _sum: { allocatedQuantity: true, soldQuantity: true },
        })
      : Promise.resolve([]),
    activeIds.length
      ? prismadb.order.aggregate({
          where: { fairEventId: { in: activeIds } },
          _sum: { total: true },
        })
      : Promise.resolve({ _sum: { total: null } }),
  ]);
  const unitsOut = activeAllocations.reduce(
    (total, row) =>
      total + ((row._sum.allocatedQuantity ?? 0) - (row._sum.soldQuantity ?? 0)),
    0,
  );
  const metrics: FairMetrics = {
    openFairs: activeFairs.filter((fair) => fair.status === "OPEN").length,
    unitsOut,
    soldValue: Number(activeSales._sum.total ?? 0),
    awaitingReconciliation: activeFairs.filter((fair) => fair.status === "RECONCILING").length,
  };

  const countFor = (wanted: FairView) => {
    const allowed = fairViewStatuses(wanted);
    return byStatus
      .filter((row) => !allowed || allowed.includes(row.status))
      .reduce((total, row) => total + row._count._all, 0);
  };

  return {
    view,
    counts: {
      activas: countFor("activas"),
      cerradas: countFor("cerradas"),
      todas: countFor("todas"),
    },
    metrics,
    fairs: fairs.map((fair) => ({
      id: fair.id,
      name: fair.name,
      location: fair.location,
      startsAt: fair.startsAt?.toISOString() ?? null,
      endsAt: fair.endsAt?.toISOString() ?? null,
      status: fair.status,
      totalAllocated: allocationBy.get(fair.id)?.allocatedQuantity ?? 0,
      totalSold: allocationBy.get(fair.id)?.soldQuantity ?? 0,
      salesTotal: Number(salesBy.get(fair.id)?.total ?? 0),
      capsules: fair._count.capsules,
    })),
  };
}
