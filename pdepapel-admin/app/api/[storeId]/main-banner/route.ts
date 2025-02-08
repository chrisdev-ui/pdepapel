import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { getPublicIdFromCloudinaryUrl, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const body = await req.json();
    const { title, label1, label2, highlight, callToAction, imageUrl } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!imageUrl) throw ErrorFactory.InvalidRequest("Se requiere una imagen");

    if (!callToAction)
      throw ErrorFactory.InvalidRequest("Se requiere una URL de redirección");

    const mainBanner = await prismadb.mainBanner.create({
      data: {
        title,
        label1,
        label2,
        highlight,
        callToAction,
        imageUrl,
        storeId: params.storeId,
      },
    });

    return NextResponse.json(mainBanner);
  } catch (error) {
    return handleErrorResponse(error, "MAIN_BANNERS_POST");
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const mainBanner = await prismadb.mainBanner.findFirst({
      where: { storeId: params.storeId },
    });

    return NextResponse.json(mainBanner);
  } catch (error) {
    return handleErrorResponse(error, "MAIN_BANNERS_GET");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de mensajes publicitarios principales en formato de arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
      const mainBanners = await tx.mainBanner.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
        include: {
          store: true,
        },
      });

      if (mainBanners.length > 0) {
        const publicIds = mainBanners
          .map((mainBanner) =>
            getPublicIdFromCloudinaryUrl(mainBanner.imageUrl),
          )
          .filter((id): id is string => id !== null && id !== undefined);

        if (publicIds.length > 0) {
          try {
            await cloudinaryInstance.v2.api.delete_resources(publicIds, {
              type: "upload",
              resource_type: "image",
            });
          } catch (cloudinaryError: any) {
            throw ErrorFactory.CloudinaryError(
              cloudinaryError,
              "Error al intentar eliminar imágenes de banner principal",
            );
          }
        }
      }

      const deletedMainBanners = await tx.mainBanner.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      return {
        deletedMainBanners,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleErrorResponse(error, "MAIN_BANNERS_DELETE");
  }
}
