import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { boxInUseMessage, boxInputSchema, normalizeBoxName } from "@/lib/boxes";

export async function GET(
  req: Request,
  { params }: { params: { boxId: string; storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.boxId) {
      throw ErrorFactory.InvalidRequest("Box id is required");
    }
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const box = await prismadb.box.findFirst({
      where: {
        id: params.boxId,
        storeId: params.storeId,
      },
    });
    if (!box) throw ErrorFactory.NotFound("Caja no encontrada");

    const shipmentsCount = await prismadb.shipping.count({
      where: { boxId: box.id },
    });

    return NextResponse.json(
      { ...box, shipmentsCount },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "BOX_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { boxId: string; storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.boxId) {
      throw ErrorFactory.InvalidRequest("Box id is required");
    }

    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const box = await prismadb.box.findFirst({
      where: { id: params.boxId, storeId: params.storeId },
    });
    if (!box) throw ErrorFactory.NotFound("Caja no encontrada");

    // `Shipping.box` no tiene onDelete (relationMode = "prisma"): sin este
    // guardián los envíos quedarían apuntando a una caja que ya no existe.
    const shipmentsCount = await prismadb.shipping.count({
      where: { boxId: box.id },
    });
    if (shipmentsCount > 0) {
      throw ErrorFactory.Conflict(boxInUseMessage(shipmentsCount), {
        shipmentsCount,
      });
    }

    const deleted = await prismadb.box.deleteMany({
      where: { id: params.boxId, storeId: params.storeId },
    });
    if (deleted.count === 0) throw ErrorFactory.NotFound("Caja no encontrada");

    return NextResponse.json(box, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOX_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404, 409],
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { boxId: string; storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.boxId) {
      throw ErrorFactory.InvalidRequest("Box id is required");
    }

    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json().catch(() => null);
    const parsed = boxInputSchema.safeParse(body);
    if (!parsed.success) {
      throw ErrorFactory.InvalidRequest(
        parsed.error.issues[0]?.message ?? "Revisa los datos de la caja",
        { fieldErrors: parsed.error.flatten().fieldErrors },
      );
    }
    const { name, type, width, height, length, isDefault } = parsed.data;

    const existing = await prismadb.box.findFirst({
      where: { id: params.boxId, storeId: params.storeId },
      select: { id: true },
    });
    if (!existing) throw ErrorFactory.NotFound("Caja no encontrada");

    const siblings = await prismadb.box.findMany({
      where: { storeId: params.storeId, NOT: { id: params.boxId } },
      select: { id: true, name: true },
    });
    const wanted = normalizeBoxName(name);
    if (siblings.some((box) => normalizeBoxName(box.name) === wanted)) {
      throw ErrorFactory.Conflict(
        `Ya existe una caja llamada «${name}» en esta tienda. Usa otro nombre.`,
      );
    }

    // Quitar la predeterminada anterior del mismo tipo y guardar esta en una
    // sola transacción, siempre dentro de la tienda.
    const box = await prismadb.$transaction(async (tx) => {
      if (isDefault) {
        await tx.box.updateMany({
          where: {
            storeId: params.storeId,
            type,
            isDefault: true,
            NOT: { id: params.boxId },
          },
          data: { isDefault: false },
        });
      }
      await tx.box.updateMany({
        where: { id: params.boxId, storeId: params.storeId },
        data: { name, type, width, height, length, isDefault },
      });
      return tx.box.findFirst({
        where: { id: params.boxId, storeId: params.storeId },
      });
    });
    if (!box) throw ErrorFactory.NotFound("Caja no encontrada");

    return NextResponse.json(box, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOX_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404, 409],
    });
  }
}
