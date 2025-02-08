import { OrderStatus, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

import { EmailTemplate } from "@/components/email-template";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import {
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

    const { fullName, phone, address, orderItems, userId, guestId, payment } =
      await req.json();

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
