import { requireStoreRead } from "@/lib/store-access";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStorePromotionsCache } from "@/lib/cache";
import { assertFixedAmountBelowPrices, assertOfferTargetsInStore, offerTargetsData, parseOfferInput } from "@/lib/offers";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const input = parseOfferInput(await req.json());
    await assertOfferTargetsInStore(prismadb, params.storeId, input);
    await assertFixedAmountBelowPrices(prismadb, params.storeId, input);

    const { productIds, categoryIds, productGroupIds, ...data } = input;
    const offer = await prismadb.offer.create({
      data: {
        storeId: params.storeId,
        ...data,
        ...offerTargetsData({ productIds, categoryIds, productGroupIds }),
      },
      include: { products: true, categories: true, productGroups: true },
    });

    await invalidateStorePromotionsCache(params.storeId);

    return NextResponse.json(offer, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_POST");
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    // Campañas con su nombre interno: solo el panel. La tienda recibe los
    // precios ya calculados en cada producto.
    await requireStoreRead(params.storeId);

    const offers = await prismadb.offer.findMany({
      where: { storeId: params.storeId },
      include: {
        products: { include: { product: { select: { name: true } } } },
        categories: { include: { category: { select: { name: true } } } },
        productGroups: { include: { productGroup: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(offers, { headers: CACHE_HEADERS.DYNAMIC });
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_GET");
  }
}

const idsSchema = z.object({ ids: z.array(z.string().min(1)).min(1, "Elige al menos una oferta").max(200) });

function parseIds(body: unknown): string[] {
  const parsed = idsSchema.safeParse(body ?? {});
  if (!parsed.success) throw ErrorFactory.InvalidRequest(parsed.error.issues[0]?.message ?? "Ids no válidos");
  return Array.from(new Set(parsed.data.ids));
}

/** Borra varias ofertas de la tienda; los pedidos ya hechos conservan sus precios. */
export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);
    const ids = parseIds(await req.json());
    const found = await prismadb.offer.count({ where: { id: { in: ids }, storeId: params.storeId } });
    if (found !== ids.length) throw ErrorFactory.NotFound("Algunas ofertas no se han encontrado en esta tienda");
    const result = await prismadb.offer.deleteMany({ where: { id: { in: ids }, storeId: params.storeId } });
    await invalidateStorePromotionsCache(params.storeId);
    return NextResponse.json({ deleted: result.count }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_DELETE");
  }
}

/** «Terminar ahora» en lote: apaga las encendidas y refresca la tienda. */
export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);
    const ids = parseIds(await req.json());
    const found = await prismadb.offer.count({ where: { id: { in: ids }, storeId: params.storeId } });
    if (found !== ids.length) throw ErrorFactory.NotFound("Algunas ofertas no se han encontrado en esta tienda");
    const result = await prismadb.offer.updateMany({ where: { id: { in: ids }, storeId: params.storeId, isActive: true }, data: { isActive: false } });
    if (result.count > 0) await invalidateStorePromotionsCache(params.storeId);
    return NextResponse.json({ ended: result.count }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_PATCH");
  }
}
