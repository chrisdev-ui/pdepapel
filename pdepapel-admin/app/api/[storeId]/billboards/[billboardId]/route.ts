import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deleteBillboardById,
  getBillboardById,
  updateBillboardById,
} from "@/helpers/billboards-actions";
import { deleteResources, getPublicId } from "@/helpers/cloudinary";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { BillboardsBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  billboardId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.billboardId)
    return handleErrorResponse("Billboard ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const billboard = await getBillboardById(params.billboardId);
    return NextResponse.json(billboard);
  } catch (error) {
    console.log("[BILLBOARD_GET]", error);
    return handleErrorResponse("[BILLBOARD_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.billboardId)
    return handleErrorResponse("Billboard ID is required", 400);
  try {
    const body: BillboardsBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["label", "imageUrl"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const oldBillboard = await getBillboardById(params.billboardId);
    if (!oldBillboard) return handleErrorResponse("Billboard not found", 404);
    const publicId = getPublicId(oldBillboard.imageUrl);
    if (publicId && body.imageUrl !== oldBillboard.imageUrl)
      await deleteResources([publicId]);
    const updatedBillboard = await updateBillboardById(
      params.billboardId,
      body,
    );
    return NextResponse.json(updatedBillboard);
  } catch (error) {
    console.log("[BILLBOARD_PATCH]", error);
    return handleErrorResponse("[BILLBOARD_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.billboardId)
    return handleErrorResponse("Billboard ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const billboardToDelete = await getBillboardById(params.billboardId);
    if (!billboardToDelete)
      return handleErrorResponse("Billboard not found", 404);
    const publicId = getPublicId(billboardToDelete.imageUrl);
    if (publicId) {
      await deleteResources([publicId]);
    }
    await deleteBillboardById(params.billboardId);
    return handleSuccessResponse("Billboard was successfully deleted!");
  } catch (error) {
    console.log("[BILLBOARD_DELETE]", error);
    return handleErrorResponse("[BILLBOARD_DELETE_ERROR]", 500);
  }
}
