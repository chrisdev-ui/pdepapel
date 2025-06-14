import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import {
  CACHE_HEADERS,
  getPublicIdFromCloudinaryUrl,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    await verifyStoreOwner(userId, params.storeId);

    const { imageUrl } = await req.json();

    if (!imageUrl)
      throw ErrorFactory.InvalidRequest("La URL de la imagen es obligatoria");

    const publicId = getPublicIdFromCloudinaryUrl(imageUrl);
    if (publicId) {
      try {
        await cloudinaryInstance.v2.api.delete_resources([publicId], {
          type: "upload",
          resource_type: "image",
        });
      } catch (error) {
        throw ErrorFactory.CloudinaryError(
          error,
          "La imagen no se pudo eliminar",
        );
      }
    }
    return NextResponse.json(null, {
      status: 200,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "CLOUDINARY_DELETE");
  }
}
