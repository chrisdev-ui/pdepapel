import { NextResponse } from "next/server";

import { createCorsHeaders } from "@/lib/cors";
import {
  newsletterTokenSchema,
  unsubscribeFromNewsletter,
} from "@/lib/newsletter";
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
