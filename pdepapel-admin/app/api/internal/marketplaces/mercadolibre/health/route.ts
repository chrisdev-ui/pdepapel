import { NextResponse } from "next/server";

import { runMercadoLibreHealthJob } from "@/lib/mercadolibre/health-job";
import { getMercadoLibreHealthUrl, verifyMercadoLibreProcessorRequest } from "@/lib/mercadolibre/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Revisión diaria de Mercado Libre programada en QStash (ensureMercadoLibreHealthSchedule). */
export async function POST(request: Request) {
  const body = await request.text();
  const isValidSignature = await verifyMercadoLibreProcessorRequest(
    body,
    request.headers.get("upstash-signature"),
    getMercadoLibreHealthUrl(),
    request.headers.get("upstash-region"),
  );
  if (!isValidSignature) {
    return NextResponse.json({ error: "Firma de cola inválida" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runMercadoLibreHealthJob());
  } catch (error) {
    console.error("Mercado Libre daily health failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "La revisión diaria falló" }, { status: 500 });
  }
}
