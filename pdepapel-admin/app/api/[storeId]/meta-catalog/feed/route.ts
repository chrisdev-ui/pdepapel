import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import {
  META_CATALOG_FEED_CONTENT_TYPE,
  META_CATALOG_FEED_FILENAME,
  extractMetaCatalogFeedToken,
  isMetaCatalogFeedTokenValid,
  resolveMetaCatalogFeed,
} from "@/lib/meta-catalog-feed";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Feed hospedado para el catálogo de Meta (Commerce Manager), el que alimenta
 * WhatsApp, Instagram y Facebook. Protegido con un token atado a la tienda
 * (query, bearer o contraseña de autenticación básica); sin
 * `META_CATALOG_FEED_SECRET` la ruta no existe. Sirve lo último construido
 * desde la caché y solo genera al vuelo cuando no hay nada guardado.
 */
export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const secret = env.META_CATALOG_FEED_SECRET;
    if (!secret) {
      throw ErrorFactory.NotFound("El feed del catálogo de Meta no está configurado");
    }

    const token = extractMetaCatalogFeedToken(request);
    if (!isMetaCatalogFeedTokenValid(params.storeId, token, secret)) {
      throw ErrorFactory.Unauthorized();
    }

    const feed = await resolveMetaCatalogFeed(params.storeId);

    return new NextResponse(feed.tsv, {
      status: 200,
      headers: {
        "Content-Type": META_CATALOG_FEED_CONTENT_TYPE,
        "Content-Disposition": `inline; filename="${META_CATALOG_FEED_FILENAME}"`,
        "Last-Modified": new Date(feed.report.generatedAt).toUTCString(),
        "X-Robots-Tag": "noindex, nofollow",
        ...CACHE_HEADERS.NO_CACHE,
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "META_CATALOG_FEED", {
      expectedStatusCodes: [403, 404],
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
