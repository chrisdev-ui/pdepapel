import { NextResponse } from "next/server";

import { createCorsHeaders } from "@/lib/cors";
import { verifyEarlyAccessToken } from "@/lib/early-access";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

const getHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "GET, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getHeaders(request) });
}

export async function GET(request: Request, { params }: { params: { storeId: string } }) {
  const token = new URL(request.url).searchParams.get("token");
  const payload = verifyEarlyAccessToken(params.storeId, token);
  if (!payload) {
    return NextResponse.json({ valid: false }, { status: 400, headers: getHeaders(request) });
  }

  const campaign = await prismadb.homeContent.findFirst({
    where: { id: payload.homeContentId, storeId: params.storeId },
    select: { title: true },
  });

  return NextResponse.json(
    { valid: true, expiresAt: new Date(payload.exp * 1000).toISOString(), campaign: campaign ? { title: campaign.title } : null },
    { headers: getHeaders(request) },
  );
}
