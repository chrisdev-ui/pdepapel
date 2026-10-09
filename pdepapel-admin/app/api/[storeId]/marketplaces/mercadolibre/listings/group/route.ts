import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  createGroupPublicationDrafts,
  loadGroupPublicationPlan,
} from "@/lib/mercadolibre/group-publication-server";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

async function requireOwner(storeId: string) {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  await verifyStoreOwner(userId, storeId);
}

export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireOwner(params.storeId);
    const listingId = new URL(request.url).searchParams.get("listingId")?.trim() ?? "";
    if (!listingId) throw ErrorFactory.InvalidRequest("Elige el borrador base del grupo");
    const plan = await loadGroupPublicationPlan(params.storeId, listingId);
    return NextResponse.json(plan, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_GROUP_PLAN_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireOwner(params.storeId);
    const body = (await request.json()) as Record<string, unknown>;
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    if (!listingId) throw ErrorFactory.InvalidRequest("Elige el borrador base del grupo");
    const result = await createGroupPublicationDrafts(params.storeId, listingId, body.variants);
    return NextResponse.json(result, { status: 201, headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_GROUP_DRAFTS_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
