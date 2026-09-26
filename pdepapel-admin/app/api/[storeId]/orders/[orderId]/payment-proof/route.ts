import { NextResponse } from "next/server";

import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  fetchPaymentProof,
  PaymentProofStorageNotConfiguredError,
} from "@/lib/payment-proofs";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

/**
 * Sirve el comprobante de pago de un pedido con la sesión de la dueña.
 *
 * El bucket es privado y no hay URL que dar: aquí se lee el objeto con las
 * credenciales del servidor y se retransmiten los bytes sin caché. Es el
 * mismo principio que las capturas del manual (/manual/img). Solo la dueña:
 * la captura trae datos bancarios de la clienta, y la cuenta de solo lectura
 * no los ve.
 */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    await requireStoreOwner(params.storeId);

    const payment = await prismadb.paymentDetails.findFirst({
      where: { storeId: params.storeId, orderId: params.orderId },
      select: { proofKey: true },
    });
    if (!payment?.proofKey) {
      throw ErrorFactory.NotFound("Este pedido no tiene comprobante");
    }

    let file: Awaited<ReturnType<typeof fetchPaymentProof>>;
    try {
      file = await fetchPaymentProof(payment.proofKey, params.storeId);
    } catch (error) {
      if (error instanceof PaymentProofStorageNotConfiguredError) {
        throw new AppError(error.message, 503);
      }
      throw error;
    }
    if (!file) {
      throw ErrorFactory.NotFound("El comprobante ya no está disponible");
    }

    // Copia a un ArrayBuffer propio: el tipado de Uint8Array<ArrayBufferLike>
    // no encaja en BodyInit y una vista sobre un buffer compartido enviaría de más.
    const body = file.body.buffer.slice(
      file.body.byteOffset,
      file.body.byteOffset + file.body.byteLength,
    ) as ArrayBuffer;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_PAYMENT_PROOF_GET", {
      expectedStatusCodes: [401, 403, 404],
    });
  }
}
