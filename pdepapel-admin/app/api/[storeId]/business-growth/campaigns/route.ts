import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { buildCampaignUtmPath } from "@/lib/business-growth";
import { parseCampaignDraft } from "@/lib/business-growth-api";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);
    const draft = parseCampaignDraft(await req.json());
    const product = await prismadb.product.findFirst({
      where: {
        id: draft.productId,
        storeId: params.storeId,
        isArchived: false,
      },
      select: { id: true, slug: true },
    });
    if (!product) throw ErrorFactory.NotFound("Producto no encontrado");

    const landingPath = buildCampaignUtmPath({
      landingPath: `/producto/${product.slug}`,
      channel: draft.channel,
      campaignName: draft.name,
    });
    const url = new URL(landingPath, "https://papeleriapdepapel.com");
    const campaign = await prismadb.growthCampaign.create({
      data: {
        storeId: params.storeId,
        name: draft.name,
        channel: draft.channel,
        objective: draft.objective,
        status: draft.status,
        seasonLabel: draft.seasonLabel,
        landingPath,
        utmSource: url.searchParams.get("utm_source") ?? "social",
        utmMedium: url.searchParams.get("utm_medium") ?? "paid_social",
        utmCampaign: url.searchParams.get("utm_campaign") ?? "",
        brief: draft.brief,
        plannedBudget: draft.plannedBudget,
        createdBy: userId,
        products: { create: { productId: product.id } },
      },
      include: { products: true },
    });

    return NextResponse.json(campaign, {
      status: 201,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "GROWTH_CAMPAIGN_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
