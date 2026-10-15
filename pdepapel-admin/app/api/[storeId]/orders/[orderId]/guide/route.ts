import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

/**
 * La guía de envío en PDF de un pedido, solo para la dueña. Es el único
 * camino del PDF guardado en base64: los pedidos y las listas nunca lo traen
 * (`lib/shipping-guide-pdf.ts`), porque pesaba megas y lleva la dirección.
 */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    await requireStoreOwner(params.storeId);

    const shipping = await prismadb.shipping.findFirst({
      where: { storeId: params.storeId, orderId: params.orderId },
      select: { guidePdfBase64: true },
    });
    if (!shipping?.guidePdfBase64) {
      throw ErrorFactory.NotFound("Este pedido no tiene guía en PDF");
    }

    const bytes = Buffer.from(shipping.guidePdfBase64, "base64");
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_GUIDE_GET", {
      expectedStatusCodes: [401, 403, 404],
    });
  }
}
