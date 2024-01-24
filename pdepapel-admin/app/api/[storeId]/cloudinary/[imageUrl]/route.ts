import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { deleteResources, getPublicId } from "@/helpers/cloudinary";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";

interface Params {
  storeId: string;
  imageUrl: string;
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.imageUrl)
    return handleErrorResponse("Image URL is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const publicId = getPublicId(params.imageUrl);
    if (!publicId)
      return handleErrorResponse(
        "Invalid image URL or image is not uploaded to Cloudinary",
        400,
      );
    await deleteResources([publicId]);
    return handleSuccessResponse();
  } catch (error) {
    console.log("[CLOUDINARY_DELETE]", error);
    return handleErrorResponse("[CLOUDINARY_DELETE_ERROR]", 500);
  }
}
