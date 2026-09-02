import { NextResponse } from "next/server";

import { createCorsHeaders } from "@/lib/cors";
import {
  newsletterSubscriptionSchema,
  requestNewsletterSubscription,
} from "@/lib/newsletter";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

const getHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getHeaders(request) });
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const body = await request.json();
    if (typeof body?.company === "string" && body.company.trim()) {
      return NextResponse.json(
        { accepted: true },
        { status: 202, headers: getHeaders(request) },
      );
    }

    const parsed = newsletterSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Revisa los datos" },
        { status: 400, headers: getHeaders(request) },
      );
    }

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

    await requestNewsletterSubscription({
      storeId: params.storeId,
      email: parsed.data.email,
      source: parsed.data.source,
    });

    return NextResponse.json(
      {
        accepted: true,
        message:
          "Si aún falta confirmar, recibirás un enlace por correo. Revisa también la carpeta de spam.",
      },
      { status: 202, headers: getHeaders(request) },
    );
  } catch (error) {
    console.error("[NEWSLETTER_SUBSCRIPTION_POST]", error);
    return NextResponse.json(
      { message: "No pudimos iniciar la suscripción. Inténtalo más tarde." },
      { status: 500, headers: getHeaders(request) },
    );
  }
}
