import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  HOME_CONTENT_ADMIN_SELECT,
  HOME_CONTENT_REVALIDATION,
  HomeContentValidationError,
  homeContentDataFromInput,
  liveHomeContentWhere,
  parseHomeContentBody,
  selectLiveHomeContent,
} from "@/lib/home-content";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { assertProductsBelongToStore } from "@/lib/home-content-server";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function GET(req: Request, { params }: { params: { storeId: string } }) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const { searchParams } = new URL(req.url);

    if (searchParams.get("live")) {
      const now = new Date();
      const entries = await prismadb.homeContent.findMany({
        where: liveHomeContentWhere(params.storeId, now),
        select: HOME_CONTENT_ADMIN_SELECT,
      });
      return NextResponse.json(selectLiveHomeContent(entries, now), { headers: CACHE_HEADERS.DYNAMIC });
    }

    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const entries = await prismadb.homeContent.findMany({
      where: { storeId: params.storeId },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      select: HOME_CONTENT_ADMIN_SELECT,
    });
    return NextResponse.json(entries, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "HOME_CONTENT_GET");
  }
}

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const input = parseHomeContentBody(await req.json().catch(() => ({})));
    await assertProductsBelongToStore(params.storeId, input.productIds);

    const entry = await prismadb.homeContent.create({
      data: {
        ...homeContentDataFromInput(input),
        storeId: params.storeId,
        products: {
          create: input.productIds.map((productId, position) => ({ productId, position })),
        },
      },
      select: HOME_CONTENT_ADMIN_SELECT,
    });

    await triggerStorefrontRevalidation(HOME_CONTENT_REVALIDATION);

    return NextResponse.json(entry, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    if (error instanceof HomeContentValidationError) {
      return handleErrorResponse(ErrorFactory.InvalidRequest(error.message), "HOME_CONTENT_POST");
    }
    return handleErrorResponse(error, "HOME_CONTENT_POST");
  }
}
