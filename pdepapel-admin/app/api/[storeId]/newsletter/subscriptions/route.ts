import { NextResponse } from "next/server";

import { createCorsHeaders } from "@/lib/cors";
import {
  newsletterSubscriptionSchema,
  requestNewsletterSubscription,
} from "@/lib/newsletter";
import { screenNewsletterSignup, tripsNewsletterHoneypot } from "@/lib/newsletter-intake";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

const getHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

const ACCEPTED_MESSAGE =
  "Si aún falta confirmar, recibirás un enlace por correo. Revisa también la carpeta de spam.";

const accepted = (request: Request) =>
  NextResponse.json(
    { accepted: true, message: ACCEPTED_MESSAGE },
    { status: 202, headers: getHeaders(request) },
  );

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getHeaders(request) });
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const body = await request.json();
    if (tripsNewsletterHoneypot(body)) return accepted(request);

    const parsed = newsletterSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Revisa los datos" },
        { status: 400, headers: getHeaders(request) },
      );
    }

    const screen = await screenNewsletterSignup(request, {
      storeId: params.storeId,
      email: parsed.data.email,
      website: body?.website,
      company: body?.company,
      formStartedAt: body?.formStartedAt,
      turnstileToken: body?.turnstileToken,
    });
    if (screen.action === "drop") return accepted(request);

    const storeExists = await prismadb.store.findUnique({
      where: { id: params.storeId },
      select: { id: true },
    });
    if (!storeExists) {
      return NextResponse.json(
        { message: "La tienda no está disponible" },
        { status: 404, headers: getHeaders(request) },
      );
    }

    let interestProductId: string | null = null;
    if (parsed.data.productId) {
      const product = await prismadb.product.findFirst({
        where: { id: parsed.data.productId, storeId: params.storeId },
        select: { id: true },
      });
      interestProductId = product?.id ?? null;
    }

    await requestNewsletterSubscription({
      storeId: params.storeId,
      email: parsed.data.email,
      source: parsed.data.source,
      interestProductId,
    });

    return accepted(request);
  } catch (error) {
    console.error("[NEWSLETTER_SUBSCRIPTION_POST]", error);
    return NextResponse.json(
      { message: "No pudimos iniciar la suscripción. Inténtalo más tarde." },
      { status: 500, headers: getHeaders(request) },
    );
  }
}
