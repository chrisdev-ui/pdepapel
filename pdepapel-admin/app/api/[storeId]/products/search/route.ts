import { scrubProducts } from "@/lib/viewer-payloads";
import { requireStoreRead } from "@/lib/store-access";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";

import prismadb from "@/lib/prismadb";
import { handleErrorResponse } from "@/lib/api-errors";
import { verifyStoreOwner } from "@/lib/utils";
import { getProductsPrices } from "@/lib/discount-engine";
import { rankSaleCandidates, type SaleCandidate } from "@/lib/sale-search";

// Cache Headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Verify ownership (Admin access only)
    // This is crucial since we are skipping storefront logic
    const access = await requireStoreRead(params.storeId);

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || 20;
    const skip = (page - 1) * limit;
    // `mode=venta`: resultados ordenados para vender (código exacto, con
    // unidades, agotados al final), con el precio de oferta, en una sola página.
    const saleMode = searchParams.get("mode") === "venta";

    // Redis Caching Logic
    // Key format: store:{storeId}:admin-select:{normalized_query}:{page}
    const redis = Redis.fromEnv();
    const cacheKey = `store:${params.storeId}:admin-select:${saleMode ? "venta:" : ""}${query.toLowerCase().trim()}:${page}`;

    // 1. Try Cache
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return NextResponse.json(cachedData, {
          headers: {
            "X-Cache": "HIT",
            ...corsHeaders,
          },
        });
      }
    } catch (error) {
      console.warn("Redis Error (Get):", error);
      // Fallback to DB if Redis fails
    }

    if (saleMode) {
      const response = await searchForSale(params.storeId, query, limit);
      try {
        await redis.set(cacheKey, JSON.stringify(response), { ex: 60 });
      } catch (error) {
        console.warn("Redis Error (Set):", error);
      }
      return NextResponse.json(response, { headers: { "X-Cache": "MISS", ...corsHeaders } });
    }

    // 2. Query Database (Lightweight)
    // Fetch one extra item to determine if there is a next page
    const products = await prismadb.product.findMany({
      where: {
        storeId: params.storeId,
        isArchived: false,
        OR: [
          { name: { contains: query } },
          { sku: { contains: query } },
          { gtin: { contains: query } },
        ],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        gtin: true,
        stock: true,
        price: true,
        acqPrice: true,
        transportationCost: true,
        brand: true,
        mpn: true,
        hasNoProductIdentifier: true,
        color: { select: { name: true } },
        size: { select: { name: true } },
        design: { select: { name: true } },
        // Para «agregar todas las variantes del grupo» en Etiquetas: id, nombre
        // y cuántas variantes vivas tiene (la fila «todas las variantes»).
        productGroupId: true,
        productGroup: {
          select: { id: true, name: true, _count: { select: { products: { where: { isArchived: false } } } } },
        },
        isKit: true,
        category: {
          select: { id: true, name: true },
        },
        images: {
          take: 1,
          orderBy: { isMain: "desc" },
          select: { url: true },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: limit + 1, // Fetch one extra to check for next page
      skip: skip,
    });

    const hasMore = products.length > limit;
    const page1 = hasMore ? products.slice(0, limit) : products;
    // Solo lectura: sin costo de compra ni transporte.
    const data = access.role === "viewer" ? scrubProducts(page1 as any[]) : page1;

    const response = {
      data,
      metadata: {
        hasMore,
        nextPage: hasMore ? page + 1 : null,
      },
    };

    // 3. Store in Cache (TTL: 60 seconds)
    try {
      await redis.set(cacheKey, JSON.stringify(response), { ex: 60 });
    } catch (error) {
      console.warn("Redis Error (Set):", error);
    }

    return NextResponse.json(response, {
      headers: {
        "X-Cache": "MISS",
        ...corsHeaders,
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_SEARCH_GET");
  }
}

const SALE_SELECT = {
  id: true,
  name: true,
  sku: true,
  gtin: true,
  stock: true,
  price: true,
  isKit: true,
  soldCount: true,
  categoryId: true,
  productGroupId: true,
  color: { select: { name: true } },
  size: { select: { name: true } },
  design: { select: { name: true } },
  category: { select: { name: true } },
  images: { take: 1, orderBy: { isMain: "desc" as const }, select: { url: true } },
  kitComponents: { select: { quantity: true, component: { select: { name: true } } } },
} as const;

/**
 * Búsqueda para vender: sin texto, los más vendidos con unidades; con texto,
 * el código exacto más las coincidencias por nombre, SKU o GTIN. Se ordena
 * en `rankSaleCandidates` y cada fila trae el precio con su oferta vigente.
 */
async function searchForSale(storeId: string, rawQuery: string, limit: number) {
  const query = rawQuery.trim();
  const take = Math.min(Math.max(limit, 10), 40);
  const base = { storeId, isArchived: false } as const;
  const [exact, matches, defaults] = await Promise.all([
    query
      ? prismadb.product.findFirst({ where: { ...base, OR: [{ sku: query }, { gtin: query }] }, select: SALE_SELECT })
      : Promise.resolve(null),
    query
      ? prismadb.product.findMany({
          where: { ...base, OR: [{ name: { contains: query } }, { sku: { contains: query } }, { gtin: { contains: query } }] },
          select: SALE_SELECT,
          orderBy: [{ stock: "desc" }, { soldCount: "desc" }, { name: "asc" }],
          take: take * 2,
        })
      : Promise.resolve([]),
    query
      ? Promise.resolve([])
      : prismadb.product.findMany({
          where: { ...base, stock: { gt: 0 } },
          select: SALE_SELECT,
          orderBy: [{ soldCount: "desc" }, { name: "asc" }],
          take,
        }),
  ]);
  // El código exacto también aparece entre las coincidencias: se cuenta una vez.
  const rows = Array.from(new Map([...(exact ? [exact] : []), ...matches, ...defaults].map((row) => [row.id, row])).values());
  const prices = rows.length > 0 ? await getProductsPrices(rows, storeId) : new Map();
  const candidates: SaleCandidate[] = rows.map((row) => {
    const pricing = prices.get(row.id);
    return {
      ...row,
      price: Number(row.price),
      offerPrice: pricing ? Number(pricing.price) : Number(row.price),
      offerLabel: pricing?.offerLabel ?? null,
    };
  });
  const ranked = rankSaleCandidates(candidates, query).slice(0, take);
  return {
    data: ranked.map((row) => ({ ...row.candidate, match: row.match, available: row.available })),
    metadata: { hasMore: false, nextPage: null, total: candidates.length, truncated: candidates.length > take },
  };
}
