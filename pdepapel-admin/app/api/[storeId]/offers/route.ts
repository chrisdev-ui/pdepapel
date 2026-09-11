import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStorePromotionsCache } from "@/lib/cache";
import { assertFixedAmountBelowPrices, assertOfferTargetsInStore, offerTargetsData, parseOfferInput } from "@/lib/offers";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

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
