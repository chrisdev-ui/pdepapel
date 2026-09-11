import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { buildBatchCode, COUPON_SELECT, parseCouponBatchInput } from "@/lib/coupons";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const MAX_CODE_ATTEMPTS = 5;

/**
 * Crea un lote de cupones de una vez, con las mismas condiciones y códigos
 * únicos por tienda. Reemplaza al generador anterior, que solo devolvía una
 * lista de texto y obligaba a crear cada cupón a mano.
 */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const input = parseCouponBatchInput(await req.json());
    const { prefix, quantity, ...conditions } = input;

    const created = await prismadb.$transaction(async (tx) => {
      const codes = new Set<string>();
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && codes.size < quantity; attempt += 1) {
        const candidates = new Set<string>();
        while (candidates.size < quantity - codes.size) candidates.add(buildBatchCode(prefix));
        const taken = await tx.coupon.findMany({
          where: { storeId: params.storeId, code: { in: Array.from(candidates) } },
          select: { code: true },
        });
        const takenCodes = new Set(taken.map((coupon) => coupon.code));
        candidates.forEach((code) => {
          if (!takenCodes.has(code)) codes.add(code);
        });
      }
      if (codes.size < quantity) {
        throw ErrorFactory.Conflict("No fue posible generar códigos únicos con ese prefijo. Prueba con otro prefijo.");
      }

      await tx.coupon.createMany({
        data: Array.from(codes).map((code) => ({ storeId: params.storeId, code, ...conditions, isActive: true, isWelcomeBenefit: false })),
      });

      return tx.coupon.findMany({
        where: { storeId: params.storeId, code: { in: Array.from(codes) } },
        select: COUPON_SELECT,
        orderBy: { code: "asc" },
      });
    });

    return NextResponse.json({ createdCount: created.length, coupons: created }, { status: 201, headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COUPONS_BATCH_POST");
  }
}
