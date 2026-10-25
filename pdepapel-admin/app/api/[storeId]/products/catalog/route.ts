import { availableStock } from "@/lib/available-stock";
import { scrubProducts } from "@/lib/viewer-payloads";
import { requireStoreRead } from "@/lib/store-access";
import { readStorePolicies } from "@/lib/store-policies";
import { EXCLUDE_BUNDLE_PRODUCTS } from "@/lib/catalog-filters";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getProductsPrices } from "@/lib/discount-engine";
import { catalogPdfImageUrl } from "@/lib/catalog-pdf-image";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";
import { auth } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

const CATALOG_PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  price: true,
  stock: true,
  reservedUnits: true,
  categoryId: true,
  productGroupId: true,
  images: { select: { url: true }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], take: 1 },
  category: { select: { name: true } },
  size: { select: { name: true } },
  color: { select: { name: true } },
} satisfies Prisma.ProductSelect;

// Lectura con sesión del panel (o de la clienta): nunca en la caché pública del CDN (#6).
export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    // Alimenta el catálogo PDF de Productos (panel): lo que dibuja cada
    // tarjeta y el bloque de contacto de la tienda. Nunca fue de la tienda en
    // línea, que arma su catálogo con `GET /products`.
    const access = await requireStoreRead(params.storeId);

    const [products, store] = await Promise.all([
      prismadb.product.findMany({
        where: {
          storeId: params.storeId,
          isArchived: false,
          ...EXCLUDE_BUNDLE_PRODUCTS,
          stock: {
            gt: 0,
          },
        },
        // Solo lo que dibuja el PDF (y lo que pide la oferta): antes iban
        // todas las columnas y todas las fotos de cada producto (≈1,7 MB).
        select: CATALOG_PRODUCT_SELECT,
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

    const inStock = products.filter((product) => availableStock(product) > 0);
    // Una sola lectura de las ofertas para todo el catálogo (antes una por producto).
    const prices = await getProductsPrices(inStock, params.storeId);
    const productsWithDiscounts = inStock.map(({ images, reservedUnits: _reserved, categoryId: _category, productGroupId: _group, ...product }) => {
      const priceInfo = prices.get(product.id);
      return {
        ...product,
        price: priceInfo?.price ?? product.price,
        originalPrice: priceInfo?.originalPrice ?? product.price,
        offerLabel: priceInfo?.offerLabel ?? null,
        // La foto principal, ya en la copia del tamaño de la tarjeta.
        images: images.slice(0, 1).map((image) => ({ url: catalogPdfImageUrl(image.url), isMain: true })),
      };
    });

    return NextResponse.json(
      {
        // La cuenta de solo lectura no recibe costo de compra, transporte ni proveedor.
        products: access.role === "viewer" ? scrubProducts(productsWithDiscounts) : productsWithDiscounts,
        store: {
          ...store,
          policies: readStorePolicies(store.policies),
        },
      },
      {
        headers: CACHE_HEADERS.NO_CACHE,
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "CATALOG_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
