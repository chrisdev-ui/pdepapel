import { Coupon, OrderStatus, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

import { EmailTemplate } from "@/components/email-template";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import {
  calculateOrderTotals,
  currencyFormatter,
  generateOrderNumber,
  generatePayUPayment,
  generateWompiPayment,
  getClerkUserById,
  getLastOrderTimestamp,
} from "@/lib/utils";

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
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const {
      fullName,
      phone,
      address,
      orderItems,
      userId,
      guestId,
      payment,
      couponCode,
      subtotal,
      total,
    } = await req.json();

    const authenticatedUserId = await getClerkUserById(userId);
    if (!authenticatedUserId) throw ErrorFactory.Unauthenticated();

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
        errors.push(`Product ${productId} not found`);
        continue;
      }

      if (product.stock < quantity) {
        errors.push(`Product ${productId} out of stock`);
        continue;
      }

      if (product.stock - quantity < 0) {
        errors.push(`Product ${productId} stock would become negative`);
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
                { usedCount: { lt: prisma?.coupon.fields.maxUses } },
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

    await resend.emails.send({
      from: "Orders <admin@papeleriapdepapel.com>",
      to: ["web.christian.dev@gmail.com", "papeleria.pdepapel@gmail.com"],
      subject: `Nueva orden de compra - ${fullName}`,
      react: EmailTemplate({
        name: fullName,
        phone,
        address,
        orderNumber,
        paymentMethod: payment.method,
      }) as React.ReactElement,
    });

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
