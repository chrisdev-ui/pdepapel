import { NextResponse } from "next/server";

import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deleteBannerById,
  getBannerById,
  updateBannerById,
} from "@/helpers/banners-actions";
import { deleteResources, getPublicId } from "@/helpers/cloudinary";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { BannersBody } from "@/lib/types";

interface Params {
  storeId: string;
  bannerId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.bannerId)
    return handleErrorResponse("Banner ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const banner = await getBannerById(params.bannerId);
    if (!banner) return handleErrorResponse("Banner not found", 404);
    return NextResponse.json(banner);
  } catch (error) {
    console.log("[BANNER_GET]", error);
    return handleErrorResponse("[BANNER_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.bannerId)
    return handleErrorResponse("Banner ID is required", 400);
  try {
    const body: BannersBody = await req.json();
    const missingFields = validateMandatoryFields(body, [
      "callToAction",
      "imageUrl",
    ]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const bannerToUpdate = await getBannerById(params.bannerId);
    if (!bannerToUpdate) return handleErrorResponse("Banner not found", 404);
    const publicId = getPublicId(bannerToUpdate.imageUrl);
    if (publicId && body.imageUrl !== bannerToUpdate.imageUrl) {
      await deleteResources([publicId]);
    }
    const updatedBanner = await updateBannerById(params.bannerId, body);
    return NextResponse.json(updatedBanner);
  } catch (error) {
    console.log("[BANNER_PATCH]", error);
    return handleErrorResponse("[BANNER_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.bannerId)
    return handleErrorResponse("Banner ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const bannerToDelete = await getBannerById(params.bannerId);
    if (!bannerToDelete) return handleErrorResponse("Banner not found", 404);
    const publicId = getPublicId(bannerToDelete.imageUrl);
    if (publicId) await deleteResources([publicId]);
    await deleteBannerById(params.bannerId);
    return handleSuccessResponse("Banner was successfully deleted!");
  } catch (error) {
    console.log("[BANNER_DELETE]", error);
    return handleErrorResponse("[BANNER_DELETE_ERROR]", 500);
  }
}
