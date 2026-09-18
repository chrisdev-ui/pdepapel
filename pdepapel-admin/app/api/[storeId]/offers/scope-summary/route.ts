import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { summarizeScope } from "@/lib/offer-scope";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { DiscountType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const idList = z.array(z.string().min(1)).max(500).optional().default([]);
const bodySchema = z.object({
  productIds: idList,
  categoryIds: idList,
  productGroupIds: idList,
  type: z.nativeEnum(DiscountType).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  excludeOfferId: z.string().min(1).nullable().optional(),
});

/** Resumen del alcance mientras se edita: cuántos productos, choques y los que quedarían en $ 0. */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw ErrorFactory.InvalidRequest("Alcance no válido");
    const summary = await summarizeScope(prismadb, params.storeId, parsed.data);
    return NextResponse.json(summary, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_SCOPE_SUMMARY");
  }
}
