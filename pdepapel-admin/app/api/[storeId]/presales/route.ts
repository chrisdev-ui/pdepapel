import { requireStoreRead } from "@/lib/store-access";
import { ProductPresaleStatus } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { parsePresaleInput } from "@/lib/presale";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

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
      select: { id: true, isKit: true, isArchived: true },
    });
    if (!product) throw ErrorFactory.NotFound("El producto no existe en esta tienda");
    if (product.isArchived) {
      throw ErrorFactory.InvalidRequest("Un producto archivado no se puede poner en preventa");
    }
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
        unitLimit: input.unitLimit,
        createdBy: userId,
      },
    });

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
