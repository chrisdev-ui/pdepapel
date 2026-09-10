import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import {
  HOME_CONTENT_ADMIN_SELECT,
  HOME_CONTENT_REVALIDATION,
  HomeContentValidationError,
  homeContentDataFromInput,
  parseHomeContentBody,
} from "@/lib/home-content";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { assertProductsBelongToStore } from "@/lib/home-content-server";
import { CACHE_HEADERS, getPublicIdFromCloudinaryUrl, verifyStoreOwner } from "@/lib/utils";

type Params = { params: { storeId: string; homeContentId: string } };

async function requireOwner(params: Params["params"]) {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!params.storeId) throw ErrorFactory.MissingStoreId();
  if (!params.homeContentId) throw ErrorFactory.InvalidRequest("Se requiere el ID del contenido");
  await verifyStoreOwner(userId, params.storeId);
}

async function deleteCloudinaryImage(imageUrl: string | null, context: string) {
  if (!imageUrl) return;
  const publicId = getPublicIdFromCloudinaryUrl(imageUrl);
  if (!publicId) return;
  try {
    await cloudinaryInstance.v2.api.delete_resources([publicId], { type: "upload", resource_type: "image" });
  } catch (error: any) {
    throw ErrorFactory.CloudinaryError(error, `Error al eliminar la imagen ${context}`);
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireOwner(params);
    const entry = await prismadb.homeContent.findFirst({
      where: { id: params.homeContentId, storeId: params.storeId },
      select: HOME_CONTENT_ADMIN_SELECT,
    });
    if (!entry) throw ErrorFactory.NotFound("El contenido no existe");
    return NextResponse.json(entry, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "HOME_CONTENT_ITEM_GET");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireOwner(params);
    const input = parseHomeContentBody(await req.json().catch(() => ({})));
    await assertProductsBelongToStore(params.storeId, input.productIds);

    const current = await prismadb.homeContent.findFirst({
      where: { id: params.homeContentId, storeId: params.storeId },
      select: { id: true, imageUrl: true },
    });
    if (!current) throw ErrorFactory.NotFound("El contenido no existe");

    const data = homeContentDataFromInput(input);
    if (current.imageUrl && current.imageUrl !== data.imageUrl) {
      await deleteCloudinaryImage(current.imageUrl, "anterior del contenido de portada");
    }

    const entry = await prismadb.$transaction(async (tx) => {
      await tx.homeContentProduct.deleteMany({ where: { homeContentId: current.id } });
      return tx.homeContent.update({
        where: { id: current.id },
        data: {
          ...data,
          products: { create: input.productIds.map((productId, position) => ({ productId, position })) },
        },
        select: HOME_CONTENT_ADMIN_SELECT,
      });
    });

    await triggerStorefrontRevalidation(HOME_CONTENT_REVALIDATION);

    return NextResponse.json(entry, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    if (error instanceof HomeContentValidationError) {
      return handleErrorResponse(ErrorFactory.InvalidRequest(error.message), "HOME_CONTENT_ITEM_PATCH");
    }
    return handleErrorResponse(error, "HOME_CONTENT_ITEM_PATCH");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireOwner(params);
    const current = await prismadb.homeContent.findFirst({
      where: { id: params.homeContentId, storeId: params.storeId },
      select: { id: true, imageUrl: true },
    });
    if (!current) throw ErrorFactory.NotFound("El contenido no existe");

    await deleteCloudinaryImage(current.imageUrl, "del contenido de portada");
    await prismadb.$transaction([
      prismadb.homeContentProduct.deleteMany({ where: { homeContentId: current.id } }),
      prismadb.homeContent.delete({ where: { id: current.id } }),
    ]);

    await triggerStorefrontRevalidation(HOME_CONTENT_REVALIDATION);

    return NextResponse.json({ message: "Contenido eliminado" }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "HOME_CONTENT_ITEM_DELETE");
  }
}
