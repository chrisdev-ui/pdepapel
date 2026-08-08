import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreResource } from "@/lib/mercadolibre/client";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string; categoryId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    if (!/^[A-Z]{3}[A-Z0-9_-]{2,}$/i.test(params.categoryId)) {
      throw ErrorFactory.InvalidRequest(
        "La categoría de Mercado Libre no es válida",
      );
    }

    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: { id: true },
    });
    if (!connection) {
      throw ErrorFactory.NotFound("Primero conecta la cuenta de Mercado Libre");
    }

    const payload = await getMercadoLibreResource(
      connection.id,
      `/categories/${encodeURIComponent(params.categoryId)}/attributes`,
    );
    const attributes = Array.isArray(payload)
      ? payload.flatMap((item) => {
          const attribute = asRecord(item);
          if (
            !attribute ||
            typeof attribute.id !== "string" ||
            typeof attribute.name !== "string"
          ) {
            return [];
          }
          const tags = asRecord(attribute.tags);
          if (tags?.hidden === true || tags?.read_only === true) return [];
          const values = Array.isArray(attribute.values)
            ? attribute.values
                .flatMap((value) => {
                  const option = asRecord(value);
                  return option &&
                    typeof option.id === "string" &&
                    typeof option.name === "string"
                    ? [{ id: option.id, name: option.name }]
                    : [];
                })
                .slice(0, 100)
            : [];
          return [
            {
              id: attribute.id,
              name: attribute.name,
              required:
                tags?.required === true || tags?.catalog_required === true,
              valueType:
                typeof attribute.value_type === "string"
                  ? attribute.value_type
                  : "string",
              values,
            },
          ];
        })
      : [];

    return NextResponse.json(attributes, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_CATEGORY_ATTRIBUTES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
