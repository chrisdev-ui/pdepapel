import { NextResponse } from "next/server";

import { createCorsHeaders } from "@/lib/cors";
import {
  checkNewsletterConfirmationToken,
  confirmNewsletterSubscription,
  newsletterTokenSchema,
} from "@/lib/newsletter";
import { readJsonBody } from "@/lib/request-body";
import { CACHE_HEADERS } from "@/lib/utils";

const getHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "GET, POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getHeaders(request) });
}

/**
 * Solo dice en qué estado está el enlace. Los escáneres de correo abren los
 * enlaces con GET; confirmar aquí les daba la suscripción y el cupón.
 */
export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const parsed = newsletterTokenSchema.safeParse({
      token: new URL(request.url).searchParams.get("token") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { status: "invalid" },
        { status: 400, headers: getHeaders(request) },
      );
    }

    const result = await checkNewsletterConfirmationToken(
      params.storeId,
      parsed.data.token,
    );
    return NextResponse.json(result, { headers: getHeaders(request) });
  } catch (error) {
    console.error("[NEWSLETTER_CONFIRM_GET]", error);
    return NextResponse.json(
      { status: "error" },
      { status: 500, headers: getHeaders(request) },
    );
  }
}

/** La confirmación de verdad: solo con el clic en «Confirmar mi suscripción». */
export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const read = await readJsonBody(request, "NEWSLETTER_CONFIRM_POST");
    const body = read.ok ? (read.body as { token?: unknown } | null) : null;
    const parsed = newsletterTokenSchema.safeParse({ token: body?.token });
    if (!parsed.success) {
      return NextResponse.json(
        { status: "invalid" },
        { status: 400, headers: getHeaders(request) },
      );
    }

    const result = await confirmNewsletterSubscription(
      params.storeId,
      parsed.data.token,
    );
    return NextResponse.json(result, {
      status:
        result.status === "confirmed" || result.status === "already_confirmed"
          ? 200
          : 400,
      headers: getHeaders(request),
    });
  } catch (error) {
    console.error("[NEWSLETTER_CONFIRM_POST]", error);
    return NextResponse.json(
      { status: "error" },
      { status: 500, headers: getHeaders(request) },
    );
  }
}
