import { requireStoreOwner, requireStoreRead } from "@/lib/store-access";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import {
  META_CATALOG_FEED_SCHEDULE_LABEL,
  getMetaCatalogFeedUrl,
  readCachedMetaCatalogFeed,
  refreshMetaCatalogFeed,
} from "@/lib/meta-catalog-feed";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Lectura: la dueña o una cuenta de solo lectura con esta tienda permitida. */
async function requireRead(storeId: string) {
  return requireStoreRead(storeId);
}

/** Refrescar el feed escribe: solo la dueña. */
async function requireOwner(storeId: string) {
  await requireStoreOwner(storeId);
}

/** Vista del feed de Meta solo para la dueña: su URL, su ritmo y el último informe. */
export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const access = await requireRead(params.storeId);

    const secret = env.META_CATALOG_FEED_SECRET;
    const cached = await readCachedMetaCatalogFeed(params.storeId);

    return NextResponse.json(
      {
        configured: Boolean(secret),
        // Solo lectura: la URL del feed lleva el secreto, así que no se manda.
        feedUrl:
          access.role === "viewer"
            ? null
            : secret
          ? getMetaCatalogFeedUrl(params.storeId, secret, env.ADMIN_WEB_URL)
          : null,
        schedule: META_CATALOG_FEED_SCHEDULE_LABEL,
        report: cached?.report ?? null,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "META_CATALOG_REPORT_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

/** Regeneración manual, solo para la dueña: lee el catálogo y reescribe la caché. */
export async function POST(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireOwner(params.storeId);

    const feed = await refreshMetaCatalogFeed(params.storeId);

    return NextResponse.json(
      { report: feed.report, cached: feed.cached },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "META_CATALOG_REPORT_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
