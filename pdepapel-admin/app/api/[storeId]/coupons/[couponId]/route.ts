import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { findOtherActiveWelcomeBenefit, getCouponDetail } from "@/lib/coupon-availability";
import { COUPON_SELECT, parseCouponInput } from "@/lib/coupons";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; couponId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.couponId) throw ErrorFactory.InvalidRequest("Se requiere el ID del cupón");
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    // Uso real (pagados y reservados) y los últimos pedidos sin datos personales.
    const coupon = await getCouponDetail(prismadb, params.storeId, params.couponId);
    if (!coupon) throw ErrorFactory.NotFound("Cupón no encontrado");

    return NextResponse.json(coupon, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; couponId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.couponId) throw ErrorFactory.InvalidRequest("Se requiere el ID del cupón");

    await verifyStoreOwner(userId, params.storeId);

    const current = await prismadb.coupon.findFirst({
      where: { id: params.couponId, storeId: params.storeId },
      select: { id: true, usedCount: true },
    });
    if (!current) throw ErrorFactory.NotFound("Cupón no encontrado");

    const input = parseCouponInput(await req.json());

    if (input.maxUses !== null && input.maxUses < current.usedCount) {
      throw ErrorFactory.InvalidRequest(
        `El máximo de usos no puede ser menor que los ${current.usedCount} usos ya registrados`,
      );
    }

    const duplicate = await prismadb.coupon.findFirst({
      where: { storeId: params.storeId, code: input.code, id: { not: params.couponId } },
      select: { id: true },
    });
    if (duplicate) throw ErrorFactory.Conflict("Ya existe otro cupón con este código");

    if (input.isWelcomeBenefit && input.isActive) {
      const other = await findOtherActiveWelcomeBenefit(prismadb, params.storeId, params.couponId);
      if (other) {
        throw ErrorFactory.Conflict(
          `El beneficio de bienvenida ${other.code} ya está activo. Desactívalo antes de activar otro.`,
        );
      }
    }

    const coupon = await prismadb.coupon.update({
      where: { id: params.couponId, storeId: params.storeId },
      data: input,
      select: COUPON_SELECT,
    });

    return NextResponse.json(coupon, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; couponId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.couponId) throw ErrorFactory.InvalidRequest("Se requiere el ID del cupón");

    await verifyStoreOwner(userId, params.storeId);

    const coupon = await prismadb.coupon.findFirst({
      where: { id: params.couponId, storeId: params.storeId },
      select: { ...COUPON_SELECT, _count: { select: { orders: true } } },
    });
    if (!coupon) throw ErrorFactory.NotFound("Cupón no encontrado");

    if (coupon._count.orders > 0) {
      throw ErrorFactory.Conflict(
        `No se puede eliminar: ${coupon._count.orders} ${coupon._count.orders === 1 ? "pedido lo referencia" : "pedidos lo referencian"}. Desactívalo para que nadie más lo use.`,
      );
    }

    await prismadb.coupon.delete({ where: { id: params.couponId, storeId: params.storeId } });

    const { _count, ...deleted } = coupon;
    return NextResponse.json(deleted, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_DELETE");
  }
}

/** Desactiva el cupón. Solo apaga el interruptor: la vigencia y los usos se conservan. */
export async function PUT(
  _req: Request,
  { params }: { params: { storeId: string; couponId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.couponId) throw ErrorFactory.InvalidRequest("Se requiere el ID del cupón");

    await verifyStoreOwner(userId, params.storeId);

    const coupon = await prismadb.coupon.findFirst({
      where: { id: params.couponId, storeId: params.storeId },
      select: { id: true, isActive: true },
    });
    if (!coupon) throw ErrorFactory.NotFound("Cupón no encontrado");
    if (!coupon.isActive) throw ErrorFactory.Conflict("El cupón ya está desactivado");

    const deactivated = await prismadb.coupon.update({
      where: { id: params.couponId, storeId: params.storeId },
      data: { isActive: false },
      select: COUPON_SELECT,
    });

    return NextResponse.json(deactivated, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_DEACTIVATE");
  }
}
