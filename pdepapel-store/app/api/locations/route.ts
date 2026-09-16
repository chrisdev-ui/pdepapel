import { NextRequest, NextResponse } from "next/server";

import { getDaneLocations } from "@/actions/get-dane-locations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q") ?? undefined;
  const limitParam = Number(params.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

  const locations = await getDaneLocations({ q, limit });

  return NextResponse.json(locations, {
    headers: { "Cache-Control": "no-store" },
  });
}
