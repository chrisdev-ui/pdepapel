import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { calculateDiscountedPrice } from "@/lib/discount-engine";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Enable Edge Runtime for faster response times

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    // Alimenta el catálogo PDF de Productos (panel): trae filas completas de
    // Product y el bloque de contacto de la tienda. Nunca fue de la tienda en
    // línea, que arma su catálogo con `GET /products`.
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const [products, store] = await Promise.all([
      prismadb.product.findMany({
        where: {
          storeId: params.storeId,
          isArchived: false,
          categoryId: {
            notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
          },
          stock: {
            gt: 0,
          },
        },
        include: {
          images: true,
          category: {
            select: {
              name: true,
            },
          },
          size: {
            select: {
              name: true,
            },
          },
          color: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          category: {
            name: "asc",
          },
        },
      }),
      prismadb.store.findUnique({
        where: {
          id: params.storeId,
        },
        select: {
          name: true,
          logoUrl: true,
          phone: true,
          email: true,
          address: true,
          instagram: true,
          twitter: true,
          youtube: true,
          tiktok: true,
          facebook: true,
          pinterest: true,
          policies: true,
        },
      }),
    ]);

    if (!store) {
      throw ErrorFactory.NotFound("La tienda no se encuentra");
    }

    const productsWithDiscounts = await Promise.all(
      products.map(async (product) => {
        const priceInfo = await calculateDiscountedPrice(
          product,
          params.storeId,
        );
        return {
          ...product,
          price: priceInfo.price,
          originalPrice: priceInfo.originalPrice,
          offerLabel: priceInfo.offerLabel,
        };
      }),
    );

    return NextResponse.json(
      {
        products: productsWithDiscounts,
        store: {
          ...store,
          policies: store.policies
            ? JSON.parse(store.policies as string)
            : null,
        },
      },
      {
        headers: CACHE_HEADERS.DYNAMIC,
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "CATALOG_GET", {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  }
}
