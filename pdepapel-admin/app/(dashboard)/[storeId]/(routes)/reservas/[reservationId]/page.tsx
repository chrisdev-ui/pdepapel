import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppError } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { getReservationDetail } from "@/lib/stock-reservations";

import { ReservationDetail } from "./components/reservation-detail";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Reserva | PdePapel Admin",
};

export default async function ReservationPage({ params }: { params: { storeId: string; reservationId: string } }) {
  // Lleva el nombre y el celular de la clienta: solo la dueña.
  await requireStoreOwner(params.storeId);
  const detail = await getReservationDetail(params.storeId, params.reservationId).catch((error: unknown) => {
    if (error instanceof AppError && error.statusCode === 404) notFound();
    throw error;
  });
  const store = await prismadb.store.findUniqueOrThrow({ where: { id: params.storeId }, select: { reservationDefaultDays: true } });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <ReservationDetail storeId={params.storeId} detail={JSON.parse(JSON.stringify(detail))} defaultDays={store.reservationDefaultDays} />
      </div>
    </div>
  );
}
