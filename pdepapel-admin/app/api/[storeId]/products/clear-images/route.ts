import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, getPublicIdFromCloudinaryUrl } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/db-utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const body = await req.json();
    const { ids }: { ids: string[] } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de productos en formato de arreglo",
      );
    }

    // Verify store ownership
    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
      // Verify products exist and belong to the store
      const products = await tx.product.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      if (products.length !== ids.length) {
        throw ErrorFactory.InvalidRequest(
          "Algunos productos no se encontraron o no pertenecen a esta tienda",
        );
      }

      // Get all images for the products
      const images = await tx.image.findMany({
        where: {
          productId: {
            in: ids,
          },
        },
      });

      if (images.length === 0)
        throw ErrorFactory.InvalidRequest(
          "No se encontraron imágenes para los productos seleccionados",
        );

      // Extract valid Cloudinary public IDs
      const publicIds = images
        .map((image) => getPublicIdFromCloudinaryUrl(image.url))
        .filter((id): id is string => id !== null);

      // Delete images from Cloudinary if any exist
      if (publicIds.length > 0) {
        try {
          await cloudinaryInstance.v2.api.delete_resources(publicIds, {
            type: "upload",
            resource_type: "image",
          });
        } catch (cloudinaryError: any) {
          throw ErrorFactory.CloudinaryError(
            cloudinaryError,
            "Ha ocurrido un error al intentar eliminar las imágenes en el servidor Cloudinary",
          );
        }
      }

      // Delete image records from database
      const deletedImages = await tx.image.deleteMany({
        where: {
          productId: {
            in: ids,
          },
        },
      });

      return {
        deletedCount: deletedImages.count,
        deletedImages: publicIds,
      };
    });

    return NextResponse.json(result, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_CLEAR_IMAGES_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
