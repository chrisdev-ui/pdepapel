import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import {
  CACHE_HEADERS,
  getPublicIdFromCloudinaryUrl,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; mainBannerId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.mainBannerId)
      throw ErrorFactory.InvalidRequest(
        "Se requiere un ID de banner principal",
      );

    const mainBanner = await prismadb.mainBanner.findUnique({
      where: { id: params.mainBannerId, storeId: params.storeId },
      select: {
        id: true,
        title: true,
        label1: true,
        label2: true,
        highlight: true,
        callToAction: true,
        imageUrl: true,
      },
    });

    return NextResponse.json(mainBanner, {
      headers: CACHE_HEADERS.SEMI_STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "MAIN_BANNER_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; mainBannerId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.mainBannerId)
      throw ErrorFactory.InvalidRequest(
        "Se requiere un ID de banner principal",
      );

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const { title, label1, label2, highlight, callToAction, imageUrl } = body;

    if (!imageUrl)
      throw ErrorFactory.InvalidRequest(
        "Se requiere una imagen para el banner principal",
      );

    if (!callToAction)
      throw ErrorFactory.InvalidRequest(
        "Se requiere una URL de redirección para el banner principal",
      );

    const updatedMainBanner = await prismadb.$transaction(async (tx) => {
      const banner = await tx.mainBanner.findUnique({
        where: { id: params.mainBannerId, storeId: params.storeId },
      });

      if (!banner)
        throw ErrorFactory.NotFound(
          `El banner principal ${params.mainBannerId} no existe`,
        );

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
            "Error al intentar eliminar la imagen del banner principal",
          );
        }
      }

      return tx.mainBanner.update({
        where: { id: params.mainBannerId },
        data: {
          title,
          label1,
          label2,
          highlight,
          callToAction,
          imageUrl,
        },
      });
    });

    return NextResponse.json(updatedMainBanner, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MAIN_BANNER_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; mainBannerId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.mainBannerId)
      throw ErrorFactory.InvalidRequest(
        "Se requiere un ID de banner principal",
      );

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const banner = await tx.mainBanner.findUnique({
        where: { id: params.mainBannerId, storeId: params.storeId },
      });

      if (!banner)
        throw ErrorFactory.NotFound(
          `El banner principal ${params.mainBannerId} no existe`,
        );

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
            "Error al intentar eliminar la imagen del banner principal",
          );
        }
      }

      await tx.mainBanner.delete({
        where: { id: params.mainBannerId },
      });
    });

    return NextResponse.json("Banner principal eliminado correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MAIN_BANNER_DELETE");
  }
}
