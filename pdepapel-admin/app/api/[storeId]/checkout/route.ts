import { clerkClient } from "@clerk/nextjs";
import { DiscountType, OrderStatus, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

import { EmailTemplate } from "@/components/email-template";
import { DEFAULT_COUNTRY } from "@/constants";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import { CheckoutOrder } from "@/lib/types";
import {
  calculateTotalAmount,
  generateIntegritySignature,
  generateOrderNumber,
  generatePayUSignature,
  parseAndSplitAddress,
} from "@/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export interface CheckoutBody {
  fullName: string;
  phone: string;
  address: string;
  orderItems: {
    productId: string;
    variantId: string;
    quantity?: number;
  }[];
  payment?: {
    method: PaymentMethod;
  };
  userId: string;
  guestId: string;
  couponId?: string;
}

interface Params {
  storeId: string;
}

interface PayUResponse {
  referenceCode: string;
  amount: number;
  tax?: number;
  taxReturnBase?: number;
  currency?: string;
  signature: string;
  test: number;
  responseUrl: string;
  confirmationUrl: string;
  shippingAddress: string;
  shippingCity: string;
  shippingCountry: string;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request, { params }: { params: Params }) {
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400, headers: corsHeaders },
    );
  try {
    const body: CheckoutBody = await req.json();
    const {
      fullName,
      phone,
      address,
      orderItems,
      payment,
      userId,
      guestId,
      couponId,
    } = body;

    let authenticatedUserId = null;
    if (userId) {
      const user = await clerkClient.users.getUser(userId);
      if (user) {
        authenticatedUserId = user.id;
      } else {
        return NextResponse.json(
          { error: "Unauthenticated" },
          { status: 401, headers: corsHeaders },
        );
      }
    }
    if (!fullName)
      return NextResponse.json(
        { error: "Full name is required" },
        { status: 400, headers: corsHeaders },
      );
    if (!phone)
      return NextResponse.json(
        { error: "Phone is required" },
        { status: 400, headers: corsHeaders },
      );
    if (!address)
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400, headers: corsHeaders },
      );
    if (!orderItems || orderItems.length === 0)
      return NextResponse.json(
        { error: "Order items are required" },
        { status: 400, headers: corsHeaders },
      );

    const lastOrderTimestamp = await getLastOrderTimestamp(
      authenticatedUserId,
      guestId,
      params.storeId,
    );
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    if (lastOrderTimestamp && lastOrderTimestamp > threeMinutesAgo)
      return NextResponse.json(
        { error: "Too many orders" },
        { status: 429, headers: corsHeaders },
      );
    const errors: string[] = [];
    const orderItemsData = [];

    const productIds = orderItems.map((item) => item.productId);
    const variantIds = orderItems.map((item) => item.variantId);
    const products = await prismadb.product.findMany({
      where: { id: { in: productIds } },
    });
    const variants = await prismadb.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        discount: true,
      },
    });

    for (const { productId, variantId, quantity = 1 } of orderItems) {
      const product = products.find((product) => product.id === productId);
      const variant = variants.find((variant) => variant.id === variantId);
      let newQuantity = quantity;

      if (!variant) {
        errors.push(`Variant ${variantId} not found`);
        continue;
      }

      if (variant.stock < quantity) {
        errors.push(`Variant ${variantId} out of stock`);
        continue;
      }

      if (variant.stock - quantity < 0) {
        errors.push(`Variant ${variantId} stock would become negative`);
        continue;
      }

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

      if (
        variant.discount &&
        variant.discount.type === DiscountType.BUY_X_GET_Y
      ) {
        const { x, y } = variant.discount;
        if (x && y && quantity >= x) {
          const discountQuantity = Math.floor(quantity / x) * y;
          if (variant.stock - discountQuantity < 0) {
            errors.push(
              `Variant ${variantId} stock would become negative with discount`,
            );
            continue;
          } else {
            newQuantity = discountQuantity;
          }
        }
      }

      orderItemsData.push({
        product: { connect: { id: productId } },
        variant: { connect: { id: variantId } },
        quantity: newQuantity,
      });
    }

    if (errors.length > 0)
      return NextResponse.json(
        { errors },
        { status: 400, headers: corsHeaders },
      );

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
          couponId,
          orderItems: { create: orderItemsData },
          payment: {
            create: {
              storeId: params.storeId,
              method: payment?.method,
            },
          },
        },
        include: {
          orderItems: {
            include: {
              product: true,
              variant: {
                include: {
                  discount: true,
                },
              },
            },
          },
          payment: true,
          coupon: true,
        },
      }),
      ...orderItems.map(({ variantId, quantity = 1 }) => {
        return prismadb.inventory.upsert({
          where: {
            variantId,
            storeId: params.storeId,
          },
          update: {
            onHold: {
              increment: quantity,
            },
            quantity: {
              decrement: quantity,
            },
          },
          create: {
            variantId,
            storeId: params.storeId,
            quantity,
            sold: 0,
            onHold: quantity,
          },
        });
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
        paymentMethod: payment?.method as string,
      }) as React.ReactElement,
    });

    if (payment?.method === PaymentMethod.PayU) {
      const payUData = generatePayUPayment(order as CheckoutOrder);

      return NextResponse.json(
        {
          ...payUData,
        },
        { headers: corsHeaders },
      );
    }

    const url = await generateWompiPayment(order as CheckoutOrder);

    return NextResponse.json({ url }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("[ORDER_CHECKOUT]", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error.message,
      },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function generateWompiPayment(
  order: CheckoutOrder,
): Promise<string> {
  const expirationTime = new Date(
    new Date().setHours(new Date().getHours() + 1),
  ).toISOString();

  const amountInCents = calculateTotalAmount(order) * 100;

  const signatureIntegrity = await generateIntegritySignature({
    reference: order.id,
    amountInCents,
    currency: "COP",
    integritySecret: env.WOMPI_INTEGRITY_KEY,
    expirationTime,
  });

  const url = `https://checkout.wompi.co/p/?public-key=${env.WOMPI_API_KEY}&currency=COP&amount-in-cents=${amountInCents}&reference=${order.id}&signature:integrity=${signatureIntegrity}&redirect-url=${env.FRONTEND_STORE_URL}/order/${order.id}&expiration-time=${expirationTime}`;

  return url;
}

export function generatePayUPayment(order: CheckoutOrder): PayUResponse {
  const amount = calculateTotalAmount(order);
  const { shippingAddress, shippingCity } = parseAndSplitAddress(order.address);
  return {
    referenceCode: order.id,
    amount,
    signature: generatePayUSignature({
      apiKey: env.PAYU_API_KEY,
      merchantId: env.PAYU_MERCHANT_ID,
      referenceCode: order.id,
      amount,
    }),
    test: env.NODE_ENV === "production" ? 0 : 1,
    responseUrl:
      env.NODE_ENV === "production"
        ? `${env.FRONTEND_STORE_URL}/order/${order.id}`
        : `https://21dmqprm-3001.use2.devtunnels.ms/order/${order.id}`,
    confirmationUrl:
      env.NODE_ENV === "production"
        ? `${env.ADMIN_WEB_URL}/api/webhook/payu`
        : "https://4d8b-2800-e6-4010-ec51-ac30-1677-a33f-4dd9.ngrok-free.app/api/webhook/payu",
    shippingAddress,
    shippingCity,
    shippingCountry: DEFAULT_COUNTRY,
  };
}
