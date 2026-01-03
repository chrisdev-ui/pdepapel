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
    const { label, imageUrl, title, redirectUrl, buttonLabel } = body;

    if (!title)
      throw ErrorFactory.InvalidRequest(
        "Se requiere un título para la publicación",
      );

    if (!label)
      throw ErrorFactory.InvalidRequest(
        "Se requiere una etiqueta para la publicación",
      );

    if (!imageUrl)
      throw ErrorFactory.InvalidRequest(
        "Se requiere una imagen para la publicación",
      );

    const billboard = await prismadb.billboard.create({
      data: {
        label,
        imageUrl,
        title,
        redirectUrl: redirectUrl ?? "",
        buttonLabel: buttonLabel ?? "",
        storeId: params.storeId,
      },
      select: {
        id: true,
        label: true,
        imageUrl: true,
        title: true,
        redirectUrl: true,
        buttonLabel: true,
      },
    });

    return NextResponse.json(billboard, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "BILLBOARDS_POST");
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const billboards = await prismadb.billboard.findMany({
      where: { storeId: params.storeId },
      select: {
        id: true,
        label: true,
        imageUrl: true,
        title: true,
        redirectUrl: true,
        buttonLabel: true,
      },
    });

    return NextResponse.json(billboards, {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "BILLBOARDS_GET");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    await verifyStoreOwner(userId, params.storeId);

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de publicaciones en formato de arreglo",
      );
    }

    await prismadb.$transaction(async (tx) => {
      const billboards = await tx.billboard.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      if (billboards.length !== ids.length) {
        throw ErrorFactory.NotFound(
          "Algunas publicaciones no se han encontrado en esta tienda",
        );
      }

      const publicIds = billboards
        .map((billboard) => getPublicIdFromCloudinaryUrl(billboard.imageUrl))
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
            "Error al intentar eliminar las imágenes de las publicaciones seleccionadas",
          );
        }
      }

      await tx.billboard.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json("Publicaciones eliminadas correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "BILLBOARDS_DELETE");
  }
}
