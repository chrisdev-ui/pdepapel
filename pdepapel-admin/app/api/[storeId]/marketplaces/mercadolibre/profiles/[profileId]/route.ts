import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { isMercadoLibreCategoryId } from "@/lib/mercadolibre/categories";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

async function requireOwnedProfile(storeId: string, profileId: string) {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  await verifyStoreOwner(userId, storeId);
  const profile = await prismadb.marketplacePublicationProfile.findFirst({
    where: { id: profileId, storeId },
    select: { id: true },
  });
  if (!profile) throw ErrorFactory.NotFound("Perfil no encontrado");
  return profile;
}

/** «Usar esta»: acepta el perfil con la categoría elegida; desde ahí se aplica solo. */
export async function PATCH(
  request: Request,
  { params }: { params: { storeId: string; profileId: string } },
) {
  try {
    const profile = await requireOwnedProfile(params.storeId, params.profileId);
    const body = (await request.json()) as Record<string, unknown>;
    const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim().toUpperCase() : "";
    if (!isMercadoLibreCategoryId(categoryId)) {
      throw ErrorFactory.InvalidRequest("Elige una categoría válida de Mercado Libre");
    }
    const updated = await prismadb.marketplacePublicationProfile.update({
      where: { id: profile.id },
      data: { categoryId, state: "ACCEPTED" },
      include: { localCategory: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_PROFILE_PATCH", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { storeId: string; profileId: string } },
) {
  try {
    const profile = await requireOwnedProfile(params.storeId, params.profileId);
    await prismadb.marketplacePublicationProfile.delete({ where: { id: profile.id } });
    return NextResponse.json({ deleted: true }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_PROFILE_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
