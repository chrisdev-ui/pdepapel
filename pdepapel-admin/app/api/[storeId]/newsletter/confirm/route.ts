import { NextResponse } from "next/server";

import { createCorsHeaders } from "@/lib/cors";
import {
  confirmNewsletterSubscription,
  newsletterTokenSchema,
} from "@/lib/newsletter";
import { CACHE_HEADERS } from "@/lib/utils";

const getHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "GET, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getHeaders(request) });
}

export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const parsed = newsletterTokenSchema.safeParse({ token });
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
      status: result.status === "confirmed" ? 200 : 400,
      headers: getHeaders(request),
    });
  } catch (error) {
    console.error("[NEWSLETTER_CONFIRM_GET]", error);
    return NextResponse.json(
      { status: "error" },
      { status: 500, headers: getHeaders(request) },
    );
  }
}
