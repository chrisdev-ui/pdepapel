import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { parseCampaignStatus } from "@/lib/business-growth-api";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; campaignId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.campaignId)
      throw ErrorFactory.NotFound("Campaña no encontrada");

    await verifyStoreOwner(userId, params.storeId);
    const campaign = await prismadb.growthCampaign.findFirst({
      where: { id: params.campaignId, storeId: params.storeId },
      select: { id: true },
    });
    if (!campaign) throw ErrorFactory.NotFound("Campaña no encontrada");

    const status = parseCampaignStatus(await req.json());
    const updatedCampaign = await prismadb.growthCampaign.update({
      where: { id: campaign.id },
      data: { status },
    });

    return NextResponse.json(updatedCampaign, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "GROWTH_CAMPAIGN_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
