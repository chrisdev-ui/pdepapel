import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { findOtherActiveWelcomeBenefit } from "@/lib/coupon-availability";
import { COUPON_SELECT, parseCouponInput } from "@/lib/coupons";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const input = parseCouponInput(await req.json());

    const existingCoupon = await prismadb.coupon.findFirst({
      where: { storeId: params.storeId, code: input.code },
      select: { id: true },
    });
    if (existingCoupon) throw ErrorFactory.Conflict("Ya existe un cupón con este código");

    if (input.isWelcomeBenefit && input.isActive) {
      const other = await findOtherActiveWelcomeBenefit(prismadb, params.storeId);
      if (other) {
        throw ErrorFactory.Conflict(
          `El beneficio de bienvenida ${other.code} ya está activo. Desactívalo antes de crear otro.`,
        );
      }
    }

    const coupon = await prismadb.coupon.create({
      data: { storeId: params.storeId, ...input },
      select: COUPON_SELECT,
    });

    return NextResponse.json(coupon, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_POST");
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    // Cada código es una llave de descuento: la lista completa (incluidos los
    // vencidos y el beneficio de bienvenida) es solo del panel. La tienda
    // valida un código concreto con `POST /coupons/validate`.
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const isActive = req.nextUrl.searchParams.get("isActive");

    const coupons = await prismadb.coupon.findMany({
      where: {
        storeId: params.storeId,
        ...(isActive !== null ? { isActive: isActive === "true" } : {}),
      },
      select: COUPON_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(coupons, { headers: CACHE_HEADERS.DYNAMIC });
  } catch (error) {
    return handleErrorResponse(error, "COUPONS_GET");
  }
}

function parseIds(body: unknown): string[] {
  const ids = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && id)) {
    throw ErrorFactory.InvalidRequest("Se requieren IDs de cupones válidos en formato de arreglo");
  }
  return Array.from(new Set(ids as string[]));
}

/** Borra varios cupones; ninguno puede tener pedidos asociados (misma regla que el borrado individual). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const ids = parseIds(await req.json());

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const coupons = await tx.coupon.findMany({
        where: { id: { in: ids }, storeId: params.storeId },
        select: { id: true, code: true, _count: { select: { orders: true } } },
      });

      if (coupons.length !== ids.length) {
        throw ErrorFactory.NotFound("Algunos cupones no se han encontrado o no pertenecen a esta tienda");
      }

      const used = coupons.find((coupon) => coupon._count.orders > 0);
      if (used) {
        throw ErrorFactory.Conflict(
          `El cupón ${used.code} tiene pedidos asociados y no puede eliminarse. Desactívalo para que nadie más lo use.`,
        );
      }

      await tx.coupon.deleteMany({ where: { storeId: params.storeId, id: { in: ids } } });
    });

    return NextResponse.json({ deleted: ids.length }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COUPONS_DELETE");
  }
}

/** Desactiva varios cupones. Solo apaga el interruptor: la vigencia se conserva. */
export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const ids = parseIds(await req.json());

    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
      const found = await tx.coupon.count({ where: { id: { in: ids }, storeId: params.storeId } });
      if (found !== ids.length) {
        throw ErrorFactory.NotFound("Algunos cupones no se han encontrado en esta tienda");
      }
      const updated = await tx.coupon.updateMany({
        where: { id: { in: ids }, storeId: params.storeId, isActive: true },
        data: { isActive: false },
      });
      return updated.count;
    });

    return NextResponse.json({ deactivated: result }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COUPONS_PATCH");
  }
}
