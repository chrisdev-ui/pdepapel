import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { refreshImageHealth } from "@/lib/image-health";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Revisión diaria de imágenes: marca las que ya no existen en Cloudinary para
 * que el panel las muestre como pendientes («Imagen rota»). Solo lectura sobre
 * el catálogo salvo la marca `Image.brokenAt`.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();

    const stores = await prismadb.store.findMany({ select: { id: true } });
    const results = await Promise.allSettled(stores.map(async (store) => ({ storeId: store.id, ...(await refreshImageHealth(store.id)) })));
    const reports = results.flatMap((result) => {
      if (result.status === "fulfilled") return [result.value];
      console.error("Image health check failed:", result.reason);
      return [];
    });

    return NextResponse.json({ reports }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "IMAGE_HEALTH_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
