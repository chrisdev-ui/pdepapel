import { requireStoreRead } from "@/lib/store-access";
import { FairCapsuleStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getFairStockAvailability } from "@/lib/fair-events";
import prismadb from "@/lib/prismadb";
import { readScannedProductId } from "@/lib/scanned-code";

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    await requireStoreRead(params.storeId);

    const raw = req.nextUrl.searchParams.get("code")?.trim();
    if (!raw) throw ErrorFactory.InvalidRequest("Ingresa o escanea un código");

    /**
     * El QR de la etiqueta lleva `PDP:<id>` y el id es un UUID en minúsculas,
     * así que se lee ANTES de pasar a mayúsculas: hacerlo después lo rompía.
     * Sin esta rama, una etiqueta normal escaneada en una feria caía en la
     * comparación por SKU y contestaba «no hay inventario», culpando al stock
     * de un código que en realidad no se sabía leer.
     */
    const scannedId = readScannedProductId(raw);
    const code = raw.toUpperCase();

    // Una cápsula siempre es «CAP-…» (`createCapsuleCode`), así que un QR de
    // etiqueta no puede serlo y esa consulta se ahorra.
    const capsule = scannedId
      ? null
      : await prismadb.fairCapsule.findFirst({
          where: {
            fairEventId: params.fairEventId,
            code,
            status: FairCapsuleStatus.PACKED,
            fairEvent: { storeId: params.storeId },
          },
          include: { product: { select: { id: true, name: true, sku: true } } },
        });
    if (capsule) {
      return NextResponse.json({
        kind: "capsule",
        code: capsule.code,
        salePrice: capsule.salePrice,
        product: capsule.product,
      });
    }

    // Lo único que cambia es CÓMO se localiza el producto; el acotado por feria
    // y por tienda, y la comprobación de unidades, siguen intactos.
    const productWhere = scannedId
      ? { id: scannedId }
      : { OR: [{ sku: code }, { gtin: code }] };

    const eventItem = await prismadb.fairEventInventoryItem.findFirst({
      where: {
        fairEventId: params.fairEventId,
        fairEvent: { storeId: params.storeId },
        product: productWhere,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            images: { orderBy: { isMain: "desc" }, take: 1 },
          },
        },
      },
    });
    /**
     * Tres finales distintos donde antes había uno.
     *
     * «No hay inventario disponible» se decía también cuando el código no se
     * sabía leer, y mandaba a contar un stock que estaba delante. Solo se
     * pregunta por la tienda cuando la feria no lo tiene, así que el camino
     * bueno sigue costando las mismas consultas que antes.
     */
    if (!eventItem) {
      const enLaTienda = await prismadb.product.findFirst({
        where: { storeId: params.storeId, ...productWhere },
        select: { name: true },
      });
      if (enLaTienda) {
        throw ErrorFactory.NotFound(
          `«${enLaTienda.name}» no está reservado para esta feria.`,
        );
      }
      throw ErrorFactory.NotFound(
        `No reconocemos «${raw}»: no es un SKU, un código de barras, un QR de etiqueta ni una cápsula de esta feria.`,
      );
    }
    if (getFairStockAvailability(eventItem) <= 0) {
      throw ErrorFactory.NotFound(
        `«${eventItem.product.name}» ya no tiene unidades en esta feria.`,
      );
    }

    return NextResponse.json({ kind: "product", product: eventItem.product });
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_LOOKUP_GET");
  }
}
