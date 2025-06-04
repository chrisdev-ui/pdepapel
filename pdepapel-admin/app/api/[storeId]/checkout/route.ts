import { Coupon, OrderStatus, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

import { EmailTemplate } from "@/components/email-template";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import {
  calculateOrderTotals,
  checkIfStoreOwner,
  currencyFormatter,
  generateOrderNumber,
  generatePayUPayment,
  generateWompiPayment,
  getClerkUserById,
  getLastOrderTimestamp,
} from "@/lib/utils";
import { auth, clerkClient } from "@clerk/nextjs";
import { sendOrderEmail } from "@/lib/email";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId: userLogged, user } = auth();
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const isStoreOwner = userLogged
      ? await checkIfStoreOwner(userLogged, params.storeId)
      : false;

    const {
      fullName,
      phone,
      address,
      email,
      orderItems,
      userId,
      guestId,
      payment,
      couponCode,
      subtotal,
      total,
    } = await req.json();

    if (!fullName)
      throw ErrorFactory.InvalidRequest("El nombre completo es obligatorio");
    if (!phone)
      throw ErrorFactory.InvalidRequest("El número de teléfono es obligatorio");
    if (!address)
      throw ErrorFactory.InvalidRequest("La dirección es obligatoria");
    if (!orderItems || orderItems.length === 0)
      throw ErrorFactory.InvalidRequest(
        "La lista de productos en el pedido no puede estar vacía",
      );

    let authenticatedUserId = userLogged;
    if (userId) {
      if (isStoreOwner) {
        try {
          await clerkClient.users.getUser(userId);
          authenticatedUserId = userId;
        } catch (error) {
          throw ErrorFactory.NotFound("El usuario asignado no existe");
        }
      } else if (!userLogged) {
        const user = await clerkClient.users.getUser(userId);
        if (user) {
          authenticatedUserId = user.id;
        } else {
          throw ErrorFactory.Unauthenticated();
        }
      }
    }

    const lastOrderTimestamp = await getLastOrderTimestamp(
      authenticatedUserId,
      guestId,
      params.storeId,
    );
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    if (lastOrderTimestamp && lastOrderTimestamp > threeMinutesAgo)
      throw ErrorFactory.OrderLimit();

    const errors: string[] = [];
    const orderItemsData = [];

    const productIds = orderItems.map(
      (item: { productId: string }) => item.productId,
    );
    const products = await prismadb.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        stock: true,
        price: true,
      },
    });

    for (const { productId, quantity = 1 } of orderItems) {
      const product = products.find((product) => product.id === productId);

      if (!product) {
        errors.push(`El producto ${productId} no existe`);
        continue;
      }

      if (product.stock < quantity) {
        errors.push(`El producto ${productId} está agotado`);
        continue;
      }

      if (product.stock - quantity < 0) {
        errors.push(
          `El producto ${productId} no puede ser vendido porque no hay suficiente stock`,
        );
        continue;
      }

      orderItemsData.push({
        product: { connect: { id: productId } },
        quantity,
      });
    }

    if (errors.length > 0) throw ErrorFactory.InvalidRequest(errors.join(", "));

    let coupon: Coupon | null = null;
    if (couponCode) {
      coupon = await prismadb.coupon.findFirst({
        where: {
          storeId: params.storeId,
          code: couponCode.toUpperCase(),
          isActive: true,
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
          OR: [
            { maxUses: null },
            {
              AND: [
                { maxUses: { not: null } },
                { usedCount: { lt: prismadb.coupon.fields.maxUses } },
              ],
            },
          ],
        },
      });

      if (!coupon) {
        throw ErrorFactory.NotFound(
          "Este cupón no es válido: puede estar inactivo, no haber iniciado aún o ya haber expirado",
        );
      }

      if (subtotal < Number(coupon.minOrderValue ?? 0)) {
        throw ErrorFactory.Conflict(
          `El pedido debe ser mayor a ${currencyFormatter.format(coupon.minOrderValue ?? 0)} para usar este cupón`,
        );
      }
    }

    const itemsWithPrices: Array<{
      product: { price: number };
      quantity: number;
    }> = orderItems.map(
      ({
        productId,
        quantity = 1,
      }: {
        productId: string;
        quantity: number | undefined;
      }) => {
        const product = products.find((p) => p.id === productId);
        if (!product) {
          throw ErrorFactory.NotFound(`Producto ${productId} no encontrado`);
        }
        return {
          product: { price: product.price },
          quantity,
        };
      },
    );

    const totals = calculateOrderTotals(itemsWithPrices, {
      coupon: coupon ? { type: coupon.type, amount: coupon.amount } : undefined,
    });

    if (
      Math.abs(totals.total - total) > 0.01 ||
      Math.abs(totals.subtotal - subtotal) > 0.01
    ) {
      throw ErrorFactory.InvalidRequest(
        "Los montos calculados no coinciden con los enviados",
      );
    }

    const orderNumber = generateOrderNumber();
    const [order] = await prismadb.$transaction([
      prismadb.order.create({
        data: {
          storeId: params.storeId,
          userId: authenticatedUserId,
          guestId: !authenticatedUserId ? guestId : null,
          orderNumber: orderNumber,
          status: OrderStatus.PENDING,
          fullName,
          phone,
          email,
          address,
          subtotal: totals.subtotal,
          total: totals.total,
          couponDiscount: totals.couponDiscount,
          couponId: coupon?.id,
          orderItems: { create: orderItemsData },
          payment: {
            create: {
              storeId: params.storeId,
              method: payment.method,
            },
          },
        },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          coupon: true,
        },
      }),
    ]);

    // Send email to admin and customer
    await sendOrderEmail(
      {
        ...order,
        email: email ?? user?.emailAddresses[0]?.emailAddress,
        payment: payment.method,
      },
      OrderStatus.PENDING,
    );

    if (payment.method === PaymentMethod.PayU) {
      const payUData = generatePayUPayment(order);

      return NextResponse.json(
        {
          ...payUData,
        },
        { headers: corsHeaders },
      );
    }

    const url = await generateWompiPayment(order);

    return NextResponse.json({ url }, { headers: corsHeaders });
  } catch (error: any) {
    return handleErrorResponse(error, "ORDER_CHECKOUT", {
      headers: corsHeaders,
    });
  }
}
