import { NextResponse } from "next/server";

import { env } from "@/lib/env.mjs";
import { sweepStockReservations } from "@/lib/stock-reservations-job";
import { verifyStockReservationsRequest } from "@/lib/stock-reservations-schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Corrida horaria de reservas, programada en QStash
 * (`ensureStockReservationsSchedule`). También responde al token de cron
 * para correrla a mano.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const bearer = request.headers.get("authorization")?.split("Bearer ").at(1);
  const fromCron = Boolean(bearer && env.CRON_SECRET && bearer === env.CRON_SECRET);
  const fromQueue =
    !fromCron &&
    (await verifyStockReservationsRequest(body, request.headers.get("upstash-signature"), request.headers.get("upstash-region")));
  if (!fromCron && !fromQueue) {
    return NextResponse.json({ error: "Firma de cola inválida" }, { status: 401 });
  }
  try {
    return NextResponse.json(await sweepStockReservations());
  } catch (error) {
    console.error("[STOCK_RESERVATIONS] La corrida horaria falló", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "La corrida de reservas falló" }, { status: 500 });
  }
}
