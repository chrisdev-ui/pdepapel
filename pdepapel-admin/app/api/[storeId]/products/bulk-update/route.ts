import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { Redis } from "@upstash/redis";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";

const RELATION_FIELDS = [
  "categoryId",
  "colorId",
  "sizeId",
  "designId",
] as const;
const FLAG_FIELDS = ["isArchived", "isFeatured", "hasNoProductIdentifier"] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const maxDuration = 60;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Invalidate cache helper
async function invalidateProductCache(storeId: string): Promise<void> {
  try {
    const redis = Redis.fromEnv();
    const pattern = `store:${storeId}:products:*`;
    let cursor = 0;
    do {
      const result = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = Number(result[0]);
      const keys = result[1];
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== 0);
  } catch (error) {
    console.error("Redis cache invalidation error:", error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const { productIds, productGroupIds, field, value } = body;

    const isRelation = RELATION_FIELDS.includes(field);
    const isFlag = FLAG_FIELDS.includes(field);
    if (!isRelation && !isFlag) {
      throw ErrorFactory.InvalidRequest("Invalid field for update");
    }
    if (isRelation && (typeof value !== "string" || !value)) {
      throw ErrorFactory.InvalidRequest("Field and value are required");
    }
    if (isFlag && typeof value !== "boolean") {
      throw ErrorFactory.InvalidRequest(
        "Archivar, destacar o marcar sin identificador requiere un valor verdadero o falso",
      );
    }

    const productsToUpdateIds = new Set<string>(productIds || []);

    // Resolve Product Groups to Product IDs
    if (productGroupIds && productGroupIds.length > 0) {
      const groupProducts = await prismadb.product.findMany({
        where: {
          storeId: params.storeId,
          productGroupId: { in: productGroupIds },
        },
        select: { id: true },
      });
      groupProducts.forEach((p) => productsToUpdateIds.add(p.id));
    }

    const finalProductIds = Array.from(productsToUpdateIds);

    if (finalProductIds.length === 0) {
      return NextResponse.json(
        { message: "No products selected for update" },
        { headers: corsHeaders },
      );
    }

    // Perform Bulk Update
    await prismadb.product.updateMany({
      where: {
        storeId: params.storeId,
        id: { in: finalProductIds },
      },
      data: {
        [field]: value,
        // «No tiene identificador global» excluye GTIN y MPN, igual que en la ficha.
        ...(field === "hasNoProductIdentifier" && value === true
          ? { gtin: null, mpn: null }
          : {}),
      },
    });

    // Invalidate Cache
    await invalidateProductCache(params.storeId);
    // Archivar o destacar cambia lo que la tienda muestra: refrescar sus páginas.
    if (isFlag) {
      await triggerStorefrontRevalidation({
        paths: ["/", "/tienda"],
        tags: ["products"],
      });
    }

    return NextResponse.json(
      { message: `Updated ${finalProductIds.length} products successfully` },
      { headers: corsHeaders },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_BULK_UPDATE", {
      headers: corsHeaders,
    });
  }
}
