import type { Metadata } from "next";

import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { isReservationFilter, listReservations, type ReservationListFilter } from "@/lib/stock-reservations";

import { ReservationsClient } from "./components/reservations-client";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Reservas | PdePapel Admin",
  description: "Unidades guardadas para clientas del grupo de WhatsApp",
};

export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams?: { filtro?: string };
}) {
  // Llevan el nombre y el celular de la clienta: solo la dueña.
  await requireStoreOwner(params.storeId);
  const requested = searchParams?.filtro ?? null;
  const filter: ReservationListFilter = isReservationFilter(requested) ? requested : "activas";
  const [reservations, store, counts] = await Promise.all([
    listReservations(params.storeId, filter),
    prismadb.store.findUniqueOrThrow({ where: { id: params.storeId }, select: { reservationDefaultDays: true } }),
    prismadb.stockReservation.groupBy({
      by: ["status"],
      where: { storeId: params.storeId, status: { in: ["ACTIVE", "CONVERTED"] } },
      _count: { _all: true },
    }),
  ]);
  const unbacked = await prismadb.stockReservation.count({
    where: { storeId: params.storeId, status: { in: ["ACTIVE", "CONVERTED"] }, unbackedAt: { not: null } },
  });
  const count = (status: string) => counts.find((row) => row.status === status)?._count._all ?? 0;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <ReservationsClient
          storeId={params.storeId}
          filter={filter}
          reservations={JSON.parse(JSON.stringify(reservations))}
          defaultDays={store.reservationDefaultDays}
          counts={{ activas: count("ACTIVE") + count("CONVERTED"), convertidas: count("CONVERTED"), sinRespaldo: unbacked }}
        />
      </div>
    </div>
  );
}
