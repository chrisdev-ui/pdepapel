import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { deleteResources, getPublicId } from "@/helpers/cloudinary";
import {
  deleteMainBannerById,
  getMainBannerById,
  updateMainBannerById,
} from "@/helpers/main-banner-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { MainBannerBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  mainBannerId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.mainBannerId)
    return handleErrorResponse("Main Banner ID is required", 400);
  try {
    const mainBanner = await getMainBannerById(params.mainBannerId);
    return NextResponse.json(mainBanner);
  } catch (error) {
    console.log("[MAIN_BANNER_GET]", error);
    return handleErrorResponse("[MAIN_BANNER_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.mainBannerId)
    return handleErrorResponse("Main Banner ID is required", 400);
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
    const mainBannerToUpdate = await getMainBannerById(params.mainBannerId);
    if (!mainBannerToUpdate)
      return handleErrorResponse("Main Banner not found", 404);
    const publicId = getPublicId(mainBannerToUpdate.imageUrl);
    if (publicId) await deleteResources([publicId]);
    const updatedMainBanner = await updateMainBannerById(
      params.mainBannerId,
      body,
    );
    return NextResponse.json(updatedMainBanner);
  } catch (error) {
    console.log("[MAIN_BANNER_PATCH]", error);
    return handleErrorResponse("[MAIN_BANNER_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.mainBannerId)
    return handleErrorResponse("Main Banner ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const mainBannerToDelete = await getMainBannerById(params.mainBannerId);
    if (!mainBannerToDelete)
      return handleErrorResponse("Main Banner not found", 404);
    const publicId = getPublicId(mainBannerToDelete.imageUrl);
    if (publicId) await deleteResources([publicId]);
    await deleteMainBannerById(params.mainBannerId);
    return handleSuccessResponse("Main Banner was successfully deleted!");
  } catch (error) {
    console.log("[MAIN_BANNER_DELETE]", error);
    return handleErrorResponse("[MAIN_BANNER_DELETE_ERROR]", 500);
  }
}
