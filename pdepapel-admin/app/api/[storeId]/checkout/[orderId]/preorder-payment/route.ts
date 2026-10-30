import { PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { generateBoldIntegritySignature, getBoldConfig } from "@/lib/bold";
import { createCorsHeaders } from "@/lib/cors";
import { createOnlinePreorderCharge } from "@/lib/order-payment-charges";
import type { OnlinePaymentMode } from "@/lib/preorder-online-rules";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import { requireJsonBody } from "@/lib/request-body";
import { CACHE_HEADERS, type CheckoutOrder, generateWompiPayment } from "@/lib/utils";

/**
 * «Abonar» y «Pagar saldo» desde `/pedido`. El id del pedido es la llave
 * pública, como «Pagar ahora». Las reglas (mínimo, tope, saldo exacto, que
 * la preventa ya se haya liberado y el saldo pedido) se deciden en el
 * servidor con los pagos de hoy: el valor que manda la página es solo lo que
 * la clienta quiere pagar. Cada cobro nace PENDING con su referencia
 * `<orderNumber>-P<n>` y solo el webhook o la conciliación lo aprueban.
 */

const getCorsHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

const MODES: OnlinePaymentMode[] = ["installment", "balance"];
const METHODS: PaymentMethod[] = [PaymentMethod.Wompi, PaymentMethod.Bold];

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function POST(req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  const corsHeaders = getCorsHeaders(req);
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.orderId) throw ErrorFactory.InvalidRequest("Se requiere el ID de la orden");

    const rate = await consumeRateLimit({ key: `preorder-payment:${params.orderId}:${getClientKey(req)}`, limit: 12, windowSeconds: 10 * 60 });
    if (!rate.allowed) throw new AppError("Espera unos minutos antes de volver a intentar el pago.", 429);

    const body = await requireJsonBody<{ mode?: unknown; amount?: unknown; method?: unknown }>(req, "PREORDER_PAYMENT_POST");
    const mode = body.mode as OnlinePaymentMode;
    if (!MODES.includes(mode)) throw ErrorFactory.InvalidRequest("Elige si abonas o pagas el saldo.");
    const method = body.method as PaymentMethod;
    if (!METHODS.includes(method)) throw ErrorFactory.InvalidRequest("Elige cómo quieres pagar.");
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);

    const charge = await createOnlinePreorderCharge({ storeId: params.storeId, orderId: params.orderId, mode, amount, method });

    if (method === PaymentMethod.Wompi) {
      const url = await generateWompiPayment({ id: params.orderId } as CheckoutOrder, { reference: charge.reference, amount: charge.amount }, { returnWithReference: true });
      return NextResponse.json({ method, reference: charge.reference, amount: charge.amount, url }, { headers: corsHeaders });
    }

    const bold = getBoldConfig();
    if (!bold.identityKey || !bold.secretKey) throw ErrorFactory.InternalServerError("El pago en línea no está configurado correctamente.");
    let storeUrl = process.env.FRONTEND_STORE_URL || "https://papeleriapdepapel.com";
    if (storeUrl.includes("localhost")) storeUrl = "https://papeleriapdepapel.com";
    else if (storeUrl.startsWith("http://")) storeUrl = storeUrl.replace(/^http:\/\//, "https://");
    return NextResponse.json(
      {
        method,
        reference: charge.reference,
        amount: charge.amount,
        orderId: params.orderId,
        orderNumber: charge.reference,
        currency: "COP",
        identityKey: bold.identityKey,
        integritySignature: generateBoldIntegritySignature(charge.reference, charge.amount, "COP", bold.secretKey),
        redirectionUrl: `${storeUrl}/pedido/${params.orderId}?pago=${encodeURIComponent(charge.reference)}`,
        description: `${mode === "balance" ? "Saldo" : "Abono"} de la preventa del pedido #${charge.orderNumber}`,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return handleErrorResponse(error, "PREORDER_PAYMENT_POST", { headers: corsHeaders, expectedStatusCodes: [400, 404, 409, 429] });
  }
}
