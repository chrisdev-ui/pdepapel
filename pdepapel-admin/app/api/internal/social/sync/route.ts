import { NextResponse } from "next/server";

import { parseSocialSyncMessage, verifySocialSyncRequest } from "@/lib/social/queue";
import { processSocialSyncMessage } from "@/lib/social/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Una pasada por cuenta, firmada por QStash. Solo «unexpected» devuelve 500 para que la cola reintente. */
export async function POST(request: Request) {
  const body = await request.text();
  const valid = await verifySocialSyncRequest(body, request.headers.get("upstash-signature"), request.headers.get("upstash-region"));
  if (!valid) return NextResponse.json({ error: "Firma de cola inválida" }, { status: 401 });
  const message = parseSocialSyncMessage(body);
  if (!message) return NextResponse.json({ error: "Mensaje inválido" }, { status: 400 });

  try {
    const outcome = await processSocialSyncMessage(message);
    const status = outcome.status === "failed" && outcome.reason === "unexpected" ? 500 : 200;
    return NextResponse.json(outcome, { status });
  } catch (error) {
    console.error("[SOCIAL_SYNC] La pasada falló", { name: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ status: "failed", reason: "unexpected" }, { status: 500 });
  }
}
