import { verifyWebhook } from "@clerk/backend/webhooks";
import { NextResponse } from "next/server";

import { recordSignupConsent } from "@/lib/legal-consent";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Webhook de Clerk (solo user.created): guarda la prueba del consentimiento al
 * crear la cuenta. La firma (Standard Webhooks) la verifica `verifyWebhook`
 * con CLERK_WEBHOOK_SIGNING_SECRET; sin ella responde 503. Las respuestas no
 * llevan datos de la persona.
 */
export async function POST(request: Request) {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    return NextResponse.json({ error: "Webhook de Clerk no configurado" }, { status: 503, headers: CACHE_HEADERS.NO_CACHE });
  }
  const eventId = request.headers.get("svix-id") ?? request.headers.get("webhook-id");

  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request, { signingSecret });
  } catch {
    return NextResponse.json({ error: "Firma inválida" }, { status: 400, headers: CACHE_HEADERS.NO_CACHE });
  }
  if (event.type !== "user.created") {
    return NextResponse.json({ ok: true, ignored: true }, { headers: CACHE_HEADERS.NO_CACHE });
  }

  try {
    const result = await recordSignupConsent({
      clerkUserId: event.data.id,
      legalAcceptedAt: event.data.legal_accepted_at,
      createdAt: event.data.created_at,
      unsafeMetadata: event.data.unsafe_metadata,
      eventId,
    });
    return NextResponse.json({ ok: true, recorded: result.recorded }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    console.error("[CLERK_WEBHOOK] No se pudo guardar el consentimiento", { name: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500, headers: CACHE_HEADERS.NO_CACHE });
  }
}
