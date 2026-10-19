import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { productsToCsv } from "@/lib/product-bulk";
import { loadBulkRows, resolveMatchingProductIds, summarizeSelection } from "@/lib/product-selection";
import { CACHE_HEADERS, currencyFormatter, verifyStoreOwner } from "@/lib/utils";

export const maxDuration = 60;

const bodySchema = z.object({
  query: z.string().max(4000),
  intent: z.enum(["summary", "csv"]),
  expectedCount: z.number().int().nonnegative().optional(),
});

/**
 * «Seleccionar los N de este filtro» en Productos: el servidor vuelve a correr
 * la consulta de la lista y devuelve cuántos son y cuántos cambian con cada
 * acción (`summary`), o el CSV de todos ellos (`csv`).
 */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const { query, intent, expectedCount } = bodySchema.parse(await req.json());
    if (intent === "summary") {
      return NextResponse.json(await summarizeSelection(params.storeId, { query, expectedCount }), { headers: CACHE_HEADERS.NO_CACHE });
    }
    const ids = await resolveMatchingProductIds(params.storeId, { query, expectedCount });
    const order = new Map(ids.map((id, index) => [id, index]));
    const rows = (await loadBulkRows(params.storeId, ids)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return NextResponse.json({ count: rows.length, csv: productsToCsv(rows, currencyFormatter) }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_SELECTION_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
