import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { formatOpeningHours, getStoreSettings } from "@/lib/store-settings";
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
        console.error(
          "[PUBLIC_STOREFRONT_SETTINGS] threshold unavailable:",
          error,
        );
        const fallback = await prismadb.store.findUnique({
          where: { id: params.storeId },
          select: { id: true, name: true },
        });
        return fallback ? { ...fallback, freeShippingThreshold: null } : null;
      });
    if (!store) throw ErrorFactory.NotFound("Tienda no encontrada");

    // Mismo criterio que el umbral: si la tabla todavía no está migrada, se
    // responde igual y la tienda usa sus textos de siempre.
    const settings = await getStoreSettings(params.storeId).catch(
      (error: unknown) => {
        console.error(
          "[PUBLIC_STOREFRONT_SETTINGS] datos del negocio no disponibles:",
          error,
        );
        return null;
      },
    );

    return NextResponse.json(
      {
        storeId: store.id,
        name: store.name,
        freeShippingThreshold:
          store.freeShippingThreshold && store.freeShippingThreshold > 0
            ? store.freeShippingThreshold
            : null,
        openingHoursLabel: formatOpeningHours(
          settings?.openingHours ?? null,
          settings?.alwaysOpen ?? false,
        ),
        cityName: settings?.cityName ?? null,
        hasPhysicalStore: settings?.hasPhysicalStore ?? false,
        physicalAddress: settings?.physicalAddress ?? null,
        deliveryEstimate: settings?.deliveryEstimate ?? null,
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
