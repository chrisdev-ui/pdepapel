import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { getPublicIdFromCloudinaryUrl, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; bannerId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.bannerId)
      throw ErrorFactory.InvalidRequest("Se requiere un ID de banner");

    const banner = await prismadb.banner.findUnique({
      where: { id: params.bannerId, storeId: params.storeId },
    });

    return NextResponse.json(banner);
  } catch (error) {
    return handleErrorResponse(error, "BANNER_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; bannerId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.bannerId)
      throw ErrorFactory.InvalidRequest("Se requiere un ID de banner");

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const { callToAction, imageUrl } = body;

    if (!imageUrl)
      throw ErrorFactory.InvalidRequest(
        "Se requiere una imagen para el banner",
      );

    if (!callToAction)
      throw ErrorFactory.InvalidRequest(
        "Se requiere una URL de redirección para el banner",
      );

    const updatedBanner = await prismadb.$transaction(async (tx) => {
      const banner = await tx.banner.findUnique({
        where: { id: params.bannerId, storeId: params.storeId },
      });

      if (!banner)
        throw ErrorFactory.NotFound(`El banner ${params.bannerId} no existe`);

      const publicId = getPublicIdFromCloudinaryUrl(banner.imageUrl);
      if (publicId && imageUrl !== banner.imageUrl) {
        try {
          await cloudinaryInstance.v2.api.delete_resources([publicId], {
            type: "upload",
            resource_type: "image",
          });
        } catch (error: any) {
          throw ErrorFactory.CloudinaryError(
            error,
            "Error al intentar eliminar la imagen del banner",
          );
        }
      }
      return tx.banner.update({
        where: { id: params.bannerId },
        data: {
          callToAction,
          imageUrl,
        },
      });
    });

    return NextResponse.json(updatedBanner);
  } catch (error) {
    return handleErrorResponse(error, "BANNER_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; bannerId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.bannerId)
      throw ErrorFactory.InvalidRequest("Se requiere un ID de banner");

    await verifyStoreOwner(userId, params.storeId);

    const deletedBanner = await prismadb.$transaction(async (tx) => {
      const banner = await tx.banner.findUnique({
        where: { id: params.bannerId, storeId: params.storeId },
      });

      if (!banner)
        throw ErrorFactory.NotFound(`El banner ${params.bannerId} no existe`);

      const publicId = getPublicIdFromCloudinaryUrl(banner.imageUrl);
      if (publicId) {
        try {
          await cloudinaryInstance.v2.api.delete_resources([publicId], {
            type: "upload",
            resource_type: "image",
          });
        } catch (error: any) {
          throw ErrorFactory.CloudinaryError(
            error,
            "Error al intentar eliminar la imagen del banner",
          );
        }
      }

      return await tx.banner.delete({
        where: { id: params.bannerId },
      });
    });

    return NextResponse.json(deletedBanner);
  } catch (error) {
    return handleErrorResponse(error, "BANNER_DELETE");
  }
}
