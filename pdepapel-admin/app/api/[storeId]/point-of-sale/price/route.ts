import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { priceLines } from "@/lib/product-pricing";
import { requireStoreRead } from "@/lib/store-access";

/**
 * Lo que vale cada línea con la cantidad que hay ahora en el carrito.
 *
 * El mostrador no multiplica precio por cantidad: pregunta. Con escalera por
 * cantidad el unitario cambia al subir la cantidad, y si el panel lo calculara
 * por su cuenta el recibo diría un número y la venta guardaría otro.
 */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireStoreRead(params.storeId);
    const body = await req.json();
    const lines = Array.isArray(body?.lines) ? body.lines : [];

    const priced = await priceLines(
      params.storeId,
      lines.map((line: { productId: string; quantity: number }) => ({
        productId: String(line.productId ?? ""),
        quantity: Number(line.quantity) || 1,
      })),
    );

    return NextResponse.json({
      lines: Array.from(priced.values()).map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        originalPrice: line.originalPrice,
        source: line.source,
        offerLabel: line.offerLabel,
        tierMinQuantity: line.tierMinQuantity,
      })),
    });
  } catch (error) {
    return handleErrorResponse(error, "POINT_OF_SALE_PRICE_POST");
  }
}
