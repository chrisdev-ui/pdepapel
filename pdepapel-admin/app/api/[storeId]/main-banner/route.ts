import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  createNewMainBanner,
  getMainBannersByStoreId,
} from "@/helpers/main-banner-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { MainBannerBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: MainBannerBody = await req.json();
    const missingFields = validateMandatoryFields(body, [
      "callToAction",
      "imageUrl",
    ]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const mainBanner = await createNewMainBanner({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(mainBanner);
  } catch (error) {
    console.log("[MAIN_BANNERS_POST]", error);
    return handleErrorResponse("[MAIN_BANNERS_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const mainBanner = await getMainBannersByStoreId(params.storeId);
    return NextResponse.json(mainBanner);
  } catch (error) {
    console.log("[MAIN_BANNERS_GET]", error);
    return handleErrorResponse("[MAIN_BANNERS_GET_ERROR]", 500);
  }
}
