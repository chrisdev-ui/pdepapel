import { OrderSource, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { generateBoldCheckoutData } from "@/lib/bold";
import { createCorsHeaders } from "@/lib/cors";
import { sendOrderEmail } from "@/lib/email";
import {
  GIFT_CARD_LINE_NAME,
  assertSellableDenomination,
} from "@/lib/gift-cards";
import { normalizeGiftFields } from "@/lib/gift-orders";
import { withIdempotency } from "@/lib/idempotency";
import { normalizePhone } from "@/lib/phone";
import prismadb from "@/lib/prismadb";
import {
  CACHE_HEADERS,
  currencyFormatter,
  generateOrderNumber,
  generateWompiPayment,
  getLastOrderTimestamp,
} from "@/lib/utils";
import { runInBackground } from "@/lib/background";

/**
 * Compra de una tarjeta de regalo desde la tienda.
 *
 * Crea un pedido GIFT_CARD (una línea manual, sin envío) y lo entrega a la
 * misma pasarela que el checkout: Bold devuelve `{ order, boldData }`, Wompi
 * `{ url }`, transferencia el pedido. La tarjeta se emite cuando el pedido
 * queda pagado (webhooks o panel), no aquí. Misma idempotencia y mismo
 * freno de tres minutos que el checkout normal.
 */
const ALLOWED_METHODS: PaymentMethod[] = [
  PaymentMethod.Bold,
  PaymentMethod.Wompi,
  PaymentMethod.BankTransfer,
];

const bodySchema = z.object({
  amount: z.coerce.number().int().positive(),
  buyerName: z.string().trim().min(3).max(100),
  buyerEmail: z.string().trim().email().max(60),
  buyerPhone: z.string().trim().max(30).optional().or(z.literal("")),
  recipientName: z.string().trim().max(100).optional().or(z.literal("")),
  recipientEmail: z.string().trim().max(60).optional().or(z.literal("")),
  message: z.string().trim().max(300).optional().or(z.literal("")),
  payment: z.object({ method: z.nativeEnum(PaymentMethod) }),
  userId: z.string().max(191).nullable().optional(),
  guestId: z.string().max(191).nullable().optional(),
});

const getCorsHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function POST(
  req: Request,
  context: { params: { storeId: string } },
) {
  return withIdempotency(
    req,
    context.params.storeId,
    () => createGiftCardCheckout(req, context),
    getCorsHeaders(req),
  );
}

async function createGiftCardCheckout(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);
  const { userId: sessionUserId } = await auth();
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw ErrorFactory.InvalidRequest(
        first?.path[0] === "buyerEmail"
          ? "Escribe un correo válido para el recibo"
          : first?.path[0] === "buyerName"
            ? "Escribe tu nombre"
            : "Revisa los datos de la tarjeta de regalo",
      );
    }
    const body = parsed.data;

    if (!ALLOWED_METHODS.includes(body.payment.method)) {
      throw ErrorFactory.InvalidRequest(
        "Una tarjeta de regalo se paga en línea o por transferencia",
      );
    }

    // Quien compra es la identidad del pedido; quien recibe va en los
    // campos de regalo, igual que en un pedido con productos.
    const recipientName = body.recipientName?.trim() || "";
    const gift = normalizeGiftFields({
      isGift: recipientName.length > 0,
      giftRecipientName: recipientName,
      giftRecipientEmail: body.recipientEmail || "",
      giftMessage: body.message || "",
    });
    // Sin nombre de quien recibe puede haber un mensaje igual (la tarjeta
    // se entrega en mano): se conserva.
    const giftMessage = gift.giftMessage ?? (body.message?.trim() || null);

    // La sesión manda: un userId del cuerpo que no coincide no vale.
    const authenticatedUserId = sessionUserId ?? null;
    const guestId = authenticatedUserId ? null : body.guestId || null;
    if (!authenticatedUserId && !guestId) {
      throw ErrorFactory.InvalidRequest("Falta el identificador de la sesión de compra");
    }

    await assertSellableDenomination(prismadb, params.storeId, body.amount);

    const lastOrderTimestamp = await getLastOrderTimestamp(
      authenticatedUserId,
      guestId,
      params.storeId,
    );
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    if (lastOrderTimestamp && lastOrderTimestamp > threeMinutesAgo) {
      throw ErrorFactory.OrderLimit();
    }

    const amount = body.amount;
    const order = await prismadb.$transaction((tx) =>
      tx.order.create({
        data: {
          storeId: params.storeId,
          userId: authenticatedUserId,
          guestId,
          orderNumber: generateOrderNumber(),
          status: OrderStatus.PENDING,
          type: OrderType.GIFT_CARD,
          source: OrderSource.STORE,
          fullName: body.buyerName,
          email: body.buyerEmail.toLowerCase(),
          phone: body.buyerPhone ? normalizePhone(body.buyerPhone) : "",
          address: "",
          ...gift,
          giftMessage,
          subtotal: amount,
          total: amount,
          orderItems: {
            create: [
              {
                name: `${GIFT_CARD_LINE_NAME} ${currencyFormatter(amount)}`,
                quantity: 1,
                price: amount,
                isCustom: true,
                productId: null,
              },
            ],
          },
          payment: {
            create: { storeId: params.storeId, method: body.payment.method },
          },
        },
        include: { orderItems: { include: { product: true } }, coupon: true },
      }),
    );

    runInBackground("correo del pedido (tarjeta de regalo)", async () => {
      try {
        await sendOrderEmail(
          { ...order, payment: body.payment.method },
          OrderStatus.PENDING,
        );
      } catch (emailError) {
        console.error("Failed to send gift card order email:", emailError);
      }
    });

    try {
      if (body.payment.method === PaymentMethod.Bold) {
        const boldData = generateBoldCheckoutData(order);
        return NextResponse.json({ order, boldData }, { headers: corsHeaders });
      }
      if (body.payment.method === PaymentMethod.BankTransfer) {
        return NextResponse.json(order, { headers: corsHeaders });
      }
      const url = await generateWompiPayment(order);
      return NextResponse.json({ url }, { headers: corsHeaders });
    } catch (paymentError: any) {
      throw ErrorFactory.InvalidRequest(
        `Error al generar datos de pago: ${paymentError.message}`,
      );
    }
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_CHECKOUT", { headers: corsHeaders });
  }
}
