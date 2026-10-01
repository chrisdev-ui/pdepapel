import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import { getProductsPrices } from "@/lib/discount-engine";
import prismadb from "@/lib/prismadb";
import { getStoreVocabulary, suggestQuery } from "@/lib/search-suggestions";
import {
  matchForm,
  normalizeSearchTerm,
  productNameSearchConditions,
  searchTokenForms,
  wordForms,
} from "@/lib/search-terms";
import { CACHE_HEADERS } from "@/lib/utils";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const getCorsHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "GET, OPTIONS" }),
  ...CACHE_HEADERS.DYNAMIC,
});

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    let search = req.nextUrl.searchParams.get("search") || "";
    if (search && req.nextUrl.searchParams.get("exact") !== "true") {
      const matches = await prismadb.product.count({ where: { storeId: params.storeId, isArchived: false, AND: productNameSearchConditions(search) } });
      if (matches === 0) {
        const suggestion = suggestQuery(search, await getStoreVocabulary(params.storeId));
        if (suggestion && suggestion !== normalizeSearchTerm(search)) search = suggestion;
      }
    }
    const page = Number(req.nextUrl.searchParams.get("page")) || 1;
    const limit = Number(req.nextUrl.searchParams.get("limit")) || 10;
    const skip = (page - 1) * limit;

    // ---------------------------------------------------------
    // REDIS CACHING (1 Hour)
    // ---------------------------------------------------------
    const cacheKey = `store:${params.storeId}:search:${search}:${page}:${limit}:v5`;
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            ...corsHeaders,
            "X-Cache": "HIT",
          },
        });
      }
    } catch (error) {
      console.error("Redis get error:", error);
    }

    // ---------------------------------------------------------
    // HYBRID SEARCH: Raw SQL for Ranking + Prisma for Data
    // ---------------------------------------------------------

    // 1. Get Ranked IDs using Raw SQL
    //
    // Palabra por palabra: cada palabra significativa tiene que aparecer en
    // el nombre (en alguna de sus formas: plural, sinónimo, lema de color) o
    // en la descripción (en su raíz). «cuadernos kuromi» ya no exige que
    // vayan seguidas, y sigue exigiendo las dos.
    //
    // Relevancia, de más a menos:
    //  100  el nombre es exactamente lo que se escribió
    //   50  el nombre empieza por lo que se escribió
    //   30  el nombre contiene la frase tal cual, seguida
    //   20  todas las palabras están en el nombre, en alguna forma
    //    5  alguna palabra solo está en la descripción
    // El 20 es lo que faltaba: «bolsos» ponía los llaveros cuya descripción
    // dice «bolsos» (5) por delante de los tote bags, que solo entraban por
    // el sinónimo y puntuaban 0.
    const palabras = searchTokenForms(search);
    // Formas largas con LIKE; las de tres letras o menos como palabra entera
    // («pin» no debe dar «pincel»). Misma regla que `formCondition`.
    const formSql = (column: Prisma.Sql, form: string) => {
      const match = matchForm(form);
      if ("contains" in match) return Prisma.sql`${column} LIKE ${`%${match.contains}%`}`;
      return Prisma.sql`(${Prisma.join(
        match.words.flatMap((w) => [
          Prisma.sql`${column} = ${w}`,
          Prisma.sql`${column} LIKE ${`${w} %`}`,
          Prisma.sql`${column} LIKE ${`% ${w}`}`,
          Prisma.sql`${column} LIKE ${`% ${w} %`}`,
        ]),
        " OR ",
      )})`;
    };
    const likeName = (form: string) => formSql(Prisma.raw("name"), form);
    const likeDescription = (form: string) => formSql(Prisma.raw("description"), form);
    const enNombre = (forms: string[]) =>
      Prisma.sql`(${Prisma.join(forms.map(likeName), " OR ")})`;
    const todasEnNombre = palabras.length
      ? Prisma.join(palabras.map((p) => enNombre(p.forms)), " AND ")
      : likeName(search);
    const todasEnAlgunLado = palabras.length
      ? Prisma.join(
          palabras.map(
            (p) =>
              Prisma.sql`(${enNombre(p.forms)} OR ${Prisma.join(wordForms(p.token).map(likeDescription), " OR ")})`,
          ),
          " AND ",
        )
      : Prisma.sql`(${likeName(search)} OR ${likeDescription(search)})`;

    const rawIds = await prismadb.$queryRaw<{ id: string }[]>`
      SELECT id,
      (
        CASE
          WHEN name LIKE ${search} THEN 100
          WHEN name LIKE ${`${search}%`} THEN 50
          WHEN name LIKE ${`%${search}%`} THEN 30
          WHEN (${todasEnNombre}) THEN 20
          ELSE 5
        END
      ) as relevance
      FROM Product
      WHERE storeId = ${params.storeId}
        AND isArchived = 0
        AND (${todasEnAlgunLado})
      ORDER BY relevance DESC, createdAt DESC
      LIMIT ${limit * 5}
      OFFSET ${skip}
    `;

    const productIds = rawIds.map((p) => p.id);

    // 2. Fetch Full Data for these IDs using Prisma
    // Note: findMany does NOT respect the order of "in" array, so we must resort later
    const unsortedProducts = await prismadb.product.findMany({
      where: {
        id: { in: productIds },
        storeId: params.storeId, // Redundant but safe
      },
      include: {
        images: {
          orderBy: { isMain: "desc" },
          take: 1,
        },
        productGroup: {
          include: {
            images: {
              orderBy: { isMain: "desc" },
              take: 1,
            },
            products: {
              select: {
                stock: true,
              },
            },
          },
        },
      },
    });

    // 3. Sort products to match the Raw SQL order
    const products = productIds
      .map((id) => unsortedProducts.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    const pricesMap = await getProductsPrices(products, params.storeId);

    const processedResults = new Map<string, any>();

    for (const product of products) {
      // If product belongs to a group, we show the Group
      if (product.productGroup) {
        const groupId = product.productGroup.id;
        if (!processedResults.has(groupId)) {
          // Use Group Data
          const groupImage =
            product.productGroup.images[0] || product.images[0];

          const priceInfo = pricesMap.get(product.id);
          const effectivePrice = priceInfo?.price ?? Number(product.price);

          processedResults.set(groupId, {
            id: product.id,
            slug: product.slug || product.id,
            name: product.productGroup.name,
            price: effectivePrice, // Representative price
            image: groupImage,
            isGroup: true,
            stock: product.productGroup.products.reduce(
              (acc, p) => acc + p.stock,
              0,
            ),
          });
        }
      } else {
        // Standalone Product
        if (!processedResults.has(product.id)) {
          const priceInfo = pricesMap.get(product.id);
          const effectivePrice = priceInfo?.price ?? Number(product.price);

          processedResults.set(product.id, {
            id: product.id,
            slug: product.slug || product.id,
            name: product.name,
            price: effectivePrice,
            image: product.images[0],
            isGroup: false,
            stock: product.stock,
          });
        }
      }
    }

    // Convert Map to Array and Slice
    const productsWithDiscounts = Array.from(processedResults.values()).slice(
      0,
      limit,
    );

    // Cache Response
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      await redis.set(cacheKey, productsWithDiscounts, { ex: 3600 });
    } catch (error) {
      console.error("Redis set error:", error);
    }

    return NextResponse.json(productsWithDiscounts, {
      headers: {
        ...corsHeaders,
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "SEARCH_PRODUCTS", {
      headers: corsHeaders,
    });
  }
}
