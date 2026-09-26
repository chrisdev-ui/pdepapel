import { NextResponse } from "next/server";

import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  deletePaymentProof,
  PaymentProofStorageNotConfiguredError,
  PaymentProofValidationError,
  uploadPaymentProof,
} from "@/lib/payment-proofs";
import { PAYMENT_PROOF_MAX_BYTES } from "@/lib/payment-proof-key";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * Comprobante de pago: se sube ANTES de registrar la venta, desde el diálogo
 * de confirmación, y la venta guarda la clave que devuelve aquí.
 *
 * Es una subida desde el servidor (multipart → bucket privado de R2), no un
 * preset sin firma desde el navegador: ver lib/payment-proofs.ts.
 */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireStoreOwner(params.storeId);

    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > PAYMENT_PROOF_MAX_BYTES + 4096) {
      throw ErrorFactory.InvalidRequest(
        "El comprobante pesa más de 4 MB. Toma una captura más pequeña",
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw ErrorFactory.InvalidRequest("Adjunta el comprobante como archivo");
    }
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      throw ErrorFactory.InvalidRequest("Adjunta el comprobante como archivo");
    }

    try {
      const proofKey = await uploadPaymentProof({
        storeId: params.storeId,
        bytes: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
      });
      return NextResponse.json(
        { proofKey },
        { status: 201, headers: CACHE_HEADERS.NO_CACHE },
      );
    } catch (error) {
      if (error instanceof PaymentProofValidationError) {
        throw ErrorFactory.InvalidRequest(error.message);
      }
      if (error instanceof PaymentProofStorageNotConfiguredError) {
        throw new AppError(error.message, 503);
      }
      throw error;
    }
  } catch (error) {
    return handleErrorResponse(error, "PAYMENT_PROOFS_POST");
  }
}

/**
 * Borra un comprobante subido y no usado (la venta se abandonó o se cambió
 * el método de pago). Un comprobante ya guardado en un pedido no se toca:
 * eso sería dejar la venta sin su respaldo.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireStoreOwner(params.storeId);

    const { proofKey } = await req.json();
    if (typeof proofKey !== "string" || !proofKey) {
      throw ErrorFactory.InvalidRequest("Falta la clave del comprobante");
    }

    const attached = await prismadb.paymentDetails.findFirst({
      where: { storeId: params.storeId, proofKey },
      select: { id: true },
    });
    if (attached) {
      throw ErrorFactory.Conflict(
        "Ese comprobante ya pertenece a una venta registrada",
      );
    }

    let deleted = false;
    try {
      deleted = await deletePaymentProof(proofKey, params.storeId);
    } catch (error) {
      if (error instanceof PaymentProofStorageNotConfiguredError) {
        throw new AppError(error.message, 503);
      }
      throw error;
    }
    if (!deleted) {
      throw ErrorFactory.InvalidRequest(
        "La clave no es un comprobante de esta tienda",
      );
    }

    return NextResponse.json(null, {
      status: 200,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "PAYMENT_PROOFS_DELETE");
  }
}
