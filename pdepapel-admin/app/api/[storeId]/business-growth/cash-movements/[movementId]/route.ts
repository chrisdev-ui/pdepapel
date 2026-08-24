import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { parseBusinessCashMovement } from "@/lib/business-growth-api";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

async function ensureMovementAccess(
  userId: string | null,
  storeId: string,
  movementId: string,
) {
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!storeId) throw ErrorFactory.MissingStoreId();
  if (!movementId) throw ErrorFactory.NotFound("Movimiento no encontrado");

  await verifyStoreOwner(userId, storeId);
  const movement = await prismadb.businessCashMovement.findFirst({
    where: { id: movementId, storeId },
    select: { id: true },
  });
  if (!movement) throw ErrorFactory.NotFound("Movimiento no encontrado");
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; movementId: string } },
) {
  try {
    const { userId } = auth();
    await ensureMovementAccess(userId, params.storeId, params.movementId);
    const movement = parseBusinessCashMovement(await req.json());
    const updatedMovement = await prismadb.businessCashMovement.update({
      where: { id: params.movementId },
      data: movement,
    });

    return NextResponse.json(updatedMovement, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "BUSINESS_CASH_MOVEMENT_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; movementId: string } },
) {
  try {
    const { userId } = auth();
    await ensureMovementAccess(userId, params.storeId, params.movementId);
    await prismadb.businessCashMovement.delete({
      where: { id: params.movementId },
    });

    return NextResponse.json(
      { success: true },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "BUSINESS_CASH_MOVEMENT_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
