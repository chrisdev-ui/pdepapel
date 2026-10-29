import { requireStoreRead } from "@/lib/store-access";
import { ProductPresaleStatus } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { parsePresaleInput } from "@/lib/presale";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";

/** Campañas de preventa de la tienda. Solo la dueña. */

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const input = parsePresaleInput(await req.json());

    const product = await prismadb.product.findFirst({
      where: { id: input.productId, storeId: params.storeId },
      select: { id: true, isKit: true },
    });
    if (!product) throw ErrorFactory.NotFound("El producto no existe en esta tienda");
    // Un producto archivado sí se puede dejar listo: la tienda no lo muestra
    // (redirige) hasta que se desarchiva, y ese es el lanzamiento.
    // Un kit no tiene stock propio: sale de sus componentes, así que liberar
    // una preventa de kit no tendría de dónde descontar.
    if (product.isKit) {
      throw ErrorFactory.InvalidRequest(
        "Un kit no se puede vender en preventa: su stock sale de los componentes. Haz la preventa de cada componente.",
      );
    }

    // Una sola campaña activa por producto: dos topes a la vez no se pueden
    // respetar y la tienda no sabría a cuál apuntar la línea vendida.
    const active = await prismadb.productPresale.findFirst({
      where: {
        storeId: params.storeId,
        productId: input.productId,
        status: ProductPresaleStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (active) {
      throw ErrorFactory.InvalidRequest(
        "Este producto ya tiene una preventa activa. Libérala o cancélala antes de abrir otra.",
      );
    }

    const presale = await prismadb.productPresale.create({
      data: {
        storeId: params.storeId,
        productId: input.productId,
        expectedArrivalAt: input.expectedArrivalAt,
        expectedArrivalText: input.expectedArrivalText,
        unitLimit: input.unitLimit,
        paymentMode: input.paymentMode,
        depositType: input.depositType,
        depositValue: input.depositValue,
        termsText: input.termsText,
        balanceDueDays: input.balanceDueDays,
        createdBy: userId,
      },
    });
    // La ficha y el catálogo de la tienda muestran la preventa: sin esto quedaban viejos hasta el próximo cambio del producto.
    await invalidateStoreProductsCache(params.storeId, { productIds: [product.id] });

    return NextResponse.json(presale, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PRESALES_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await requireStoreRead(params.storeId);

    const presales = await prismadb.productPresale.findMany({
      where: { storeId: params.storeId },
      orderBy: [{ status: "asc" }, { expectedArrivalAt: "asc" }],
      include: { product: { select: { name: true, sku: true, stock: true } } },
    });

    return NextResponse.json(presales, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PRESALES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
