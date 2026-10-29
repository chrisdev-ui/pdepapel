import { PreorderWaitlistChannel } from "@prisma/client";
import { NextResponse } from "next/server";

import { createCorsHeaders } from "@/lib/cors";
import { tripsNewsletterHoneypot } from "@/lib/newsletter-intake";
import { createOrReuseWaitlistEntry, findActivePresale, screenWaitlistSignup } from "@/lib/preorder-waitlist";
import { publicWaitlistSignupSchema, WAITLIST_ACCEPTED_MESSAGE } from "@/lib/preorder-waitlist-shared";
import { readJsonBody, UNREADABLE_BODY_MESSAGE } from "@/lib/request-body";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * Alta en la lista de espera de una preventa desde la tienda en línea. Mismo
 * filtro que el boletín y la misma respuesta 202 para lo aceptado y lo
 * descartado (trampa, reloj, límites, producto sin preventa activa): no se le
 * da pista a un bot. No envía nada; la dueña contacta a mano.
 */

const getHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

const accepted = (request: Request) =>
  NextResponse.json({ accepted: true, message: WAITLIST_ACCEPTED_MESSAGE }, { status: 202, headers: getHeaders(request) });

const badRequest = (request: Request, message: string) =>
  NextResponse.json({ message }, { status: 400, headers: getHeaders(request) });

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getHeaders(request) });
}

export async function POST(request: Request, { params }: { params: { storeId: string } }) {
  try {
    const read = await readJsonBody(request, "PREORDER_WAITLIST_PUBLIC_POST");
    if (!read.ok) return badRequest(request, UNREADABLE_BODY_MESSAGE);
    const body = (read.body ?? {}) as Record<string, unknown>;
    if (tripsNewsletterHoneypot(body)) return accepted(request);

    const parsed = publicWaitlistSignupSchema.safeParse(body);
    if (!parsed.success) return badRequest(request, parsed.error.issues[0]?.message ?? "Revisa los datos");
    const input = parsed.data;

    const screen = await screenWaitlistSignup(request, {
      storeId: params.storeId,
      productId: input.productId,
      phone: input.phone,
      email: input.email,
      website: body.website,
      company: body.company,
      formStartedAt: body.formStartedAt,
      turnstileToken: body.turnstileToken,
    });
    if (screen.action === "drop") return accepted(request);

    // Solo productos de esta tienda con una preventa activa; si no, la misma respuesta y nada guardado.
    const presale = await findActivePresale(params.storeId, input.productId);
    if (!presale) return accepted(request);

    await createOrReuseWaitlistEntry({
      storeId: params.storeId,
      productId: input.productId,
      presaleId: presale.id,
      name: input.name,
      phone: input.phone,
      handle: null,
      email: input.email,
      channel: PreorderWaitlistChannel.WEB,
      note: null,
      consentText: input.consentText,
      consentVersion: input.consentVersion,
      createdBy: "WEB",
    });

    return accepted(request);
  } catch (error) {
    // Solo el mensaje: el cuerpo trae nombre y contacto.
    console.error("[PREORDER_WAITLIST_PUBLIC_POST]", error instanceof Error ? error.message : "error desconocido");
    return NextResponse.json(
      { message: "No pudimos anotarte. Inténtalo más tarde." },
      { status: 500, headers: getHeaders(request) },
    );
  }
}
