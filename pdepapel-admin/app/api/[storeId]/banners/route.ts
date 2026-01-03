import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, getPublicIdFromCloudinaryUrl } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/db-utils";
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

    const banner = await prismadb.banner.create({
      data: {
        callToAction,
        imageUrl,
        storeId: params.storeId,
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json(banner, {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "BANNERS_POST");
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const banners = await prismadb.banner.findMany({
      where: { storeId: params.storeId },
      select: {
        id: true,
        callToAction: true,
        imageUrl: true,
      },
    });

    return NextResponse.json(banners, {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "BANNERS_GET");
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
        "Se requieren IDs de banners en formato de arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const banners = await tx.banner.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      if (banners.length !== ids.length)
        throw ErrorFactory.NotFound(
          "Algunos banners no se han encontrado en esta tienda",
        );

      const publicIds = banners
        .map((banner) => getPublicIdFromCloudinaryUrl(banner.imageUrl))
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
            "Error al intentar eliminar las imágenes de los banners seleccionados",
          );
        }
      }

      await tx.banner.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json("Banners eliminados correctamente", {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "BANNERS_DELETE");
  }
}
