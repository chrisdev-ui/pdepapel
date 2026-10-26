import { NextRequest, NextResponse } from "next/server";

import { getDaneLocations } from "@/actions/get-dane-locations";
import {
  filterLocations,
  locationSearchTokens,
  longestLocationToken,
} from "@/lib/location-search";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
/** Con varias palabras se pide más a la administración y se filtra aquí. */
const UPSTREAM_LIMIT = 300;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q") ?? undefined;
  const limitParam = Number(params.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;

  const tokens = locationSearchTokens(q);
  if (tokens.length === 0) {
    const popular = await getDaneLocations({ limit });
    return NextResponse.json(popular, { headers: { "Cache-Control": "no-store" } });
  }

  // La administración puede ser la de antes (busca la frase entera en un
  // solo campo): se le pide una sola palabra y aquí se exigen todas.
  const upstream = await getDaneLocations({
    q: longestLocationToken(tokens),
    limit: tokens.length > 1 ? UPSTREAM_LIMIT : limit,
  });
  const results = filterLocations(upstream.results, q).slice(0, limit);

  return NextResponse.json(
    { results, count: results.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
