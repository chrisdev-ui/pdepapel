import { NextResponse } from "next/server";

import { createCorsHeaders } from "@/lib/cors";
import { env } from "@/lib/env.mjs";
import {
  newsletterTokenSchema,
  unsubscribeFromNewsletter,
  unsubscribeNewsletterByHash,
} from "@/lib/newsletter";
import { CACHE_HEADERS } from "@/lib/utils";

const getHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "GET, POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getHeaders(request) });
}

// Enlace de los correos de campaña: cancela con el hash y vuelve a la tienda.
export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  const hash = new URL(request.url).searchParams.get("hash") ?? "";
  const result = await unsubscribeNewsletterByHash(params.storeId, hash);
  const target = new URL(
    `/suscripcion/cancelar?estado=${result.status}`,
    `${env.FRONTEND_STORE_URL.replace(/\/$/, "")}/`,
  );
  return NextResponse.redirect(target, { status: 303, headers: CACHE_HEADERS.NO_CACHE });
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const hash = new URL(request.url).searchParams.get("hash");
    if (hash) {
      const result = await unsubscribeNewsletterByHash(params.storeId, hash);
      return NextResponse.json(result, {
        status: result.status === "unsubscribed" ? 200 : 400,
        headers: getHeaders(request),
      });
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const queryToken = new URL(request.url).searchParams.get("token");
    const parsed = newsletterTokenSchema.safeParse({
      token:
        queryToken ??
        (typeof body === "object" && body && "token" in body
          ? (body as { token?: unknown }).token
          : ""),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { status: "invalid" },
        { status: 400, headers: getHeaders(request) },
      );
    }

    const result = await unsubscribeFromNewsletter(
      params.storeId,
      parsed.data.token,
    );
    return NextResponse.json(result, {
      status: result.status === "unsubscribed" ? 200 : 400,
      headers: getHeaders(request),
    });
  } catch (error) {
    console.error("[NEWSLETTER_UNSUBSCRIBE_POST]", error);
    return NextResponse.json(
      { status: "error" },
      { status: 500, headers: getHeaders(request) },
    );
  }
}
