import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

const getCorsHeaders = (request: Request) =>
  createCorsHeaders(request, { methods: "GET, OPTIONS" });

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

/**
 * Public, non-sensitive storefront settings the shop needs before the first
 * paint: the announcement bar and checkout read the free-shipping threshold
 * from here. Nothing private (owner, contact, package defaults) is exposed.
 */
export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const headers = { ...getCorsHeaders(req), ...CACHE_HEADERS.SEMI_STATIC };
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const store = await prismadb.store
      .findUnique({
        where: { id: params.storeId },
        select: { id: true, name: true, freeShippingThreshold: true },
      })
      .catch(async (error: unknown) => {
        // Column not migrated yet: still answer, with the promise disabled.
        console.error("[PUBLIC_STOREFRONT_SETTINGS] threshold unavailable:", error);
        const fallback = await prismadb.store.findUnique({
          where: { id: params.storeId },
          select: { id: true, name: true },
        });
        return fallback ? { ...fallback, freeShippingThreshold: null } : null;
      });
    if (!store) throw ErrorFactory.NotFound("Tienda no encontrada");

    return NextResponse.json(
      {
        storeId: store.id,
        name: store.name,
        freeShippingThreshold:
          store.freeShippingThreshold && store.freeShippingThreshold > 0
            ? store.freeShippingThreshold
            : null,
      },
      { headers },
    );
  } catch (error) {
    return handleErrorResponse(error, "PUBLIC_STOREFRONT_SETTINGS", {
      expectedStatusCodes: [404],
      headers,
    });
  }
}
