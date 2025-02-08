import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { getPublicIdFromCloudinaryUrl, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; billboardId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.billboardId)
      throw ErrorFactory.InvalidRequest("Se requiere un ID de publicación");

    const billboard = await prismadb.billboard.findUnique({
      where: { id: params.billboardId, storeId: params.storeId },
    });

    return NextResponse.json(billboard);
  } catch (error) {
    return handleErrorResponse(error, "BILLBOARD_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; billboardId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.billboardId)
      throw ErrorFactory.InvalidRequest("Se requiere un ID de publicación");

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const { label, imageUrl, title, redirectUrl } = body;

    if (!label)
      throw ErrorFactory.InvalidRequest(
        "Se requiere una etiqueta para la publicación",
      );

    if (!imageUrl)
      throw ErrorFactory.InvalidRequest(
        "Se requiere una imagen para la publicación",
      );

    const updatedBillboard = await prismadb.$transaction(async (tx) => {
      const billboard = await tx.billboard.findUnique({
        where: { id: params.billboardId, storeId: params.storeId },
      });

      if (!billboard)
        throw ErrorFactory.NotFound(
          `La publicación ${params.billboardId} no existe`,
        );

      const publicId = getPublicIdFromCloudinaryUrl(billboard.imageUrl);
      if (publicId) {
        try {
          await cloudinaryInstance.v2.api.delete_resources([publicId], {
            type: "upload",
            resource_type: "image",
          });
        } catch (error: any) {
          throw ErrorFactory.CloudinaryError(
            error,
            "Error al intentar eliminar la imagen de la publicación",
          );
        }
      }

      return tx.billboard.update({
        where: { id: params.billboardId },
        data: {
          label,
          imageUrl,
          title: title ?? "",
          redirectUrl: redirectUrl ?? "",
        },
      });
    });

    return NextResponse.json(updatedBillboard);
  } catch (error) {
    return handleErrorResponse(error, "BILLBOARD_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; billboardId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.billboardId)
      throw ErrorFactory.InvalidRequest("Se requiere un ID de publicación");

    await verifyStoreOwner(userId, params.storeId);

    const billboardToDelete = await prismadb.$transaction(async (tx) => {
      const billboard = await tx.billboard.findUnique({
        where: { id: params.billboardId, storeId: params.storeId },
      });

      if (!billboard)
        throw ErrorFactory.NotFound(
          `La publicación ${params.billboardId} no existe`,
        );

      const publicId = getPublicIdFromCloudinaryUrl(billboard.imageUrl);
      if (publicId) {
        try {
          await cloudinaryInstance.v2.api.delete_resources([publicId], {
            type: "upload",
            resource_type: "image",
          });
        } catch (error: any) {
          throw ErrorFactory.CloudinaryError(
            error,
            "Error al intentar eliminar la imagen de la publicación",
          );
        }
      }

      return await tx.billboard.delete({
        where: { id: params.billboardId },
      });
    });

    return NextResponse.json(billboardToDelete);
  } catch (error) {
    return handleErrorResponse(error, "BILLBOARD_DELETE");
  }
}
