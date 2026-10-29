import { auth } from "@clerk/nextjs/server";
import { PreorderWaitlistChannel } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  createOrReuseWaitlistEntry,
  findActivePresale,
  getWaitlistCounts,
  WAITLIST_ENTRY_SELECT,
} from "@/lib/preorder-waitlist";
import { panelWaitlistEntrySchema } from "@/lib/preorder-waitlist-shared";
import prismadb from "@/lib/prismadb";
import { requireJsonBody } from "@/lib/request-body";
import { verifyStoreOwner } from "@/lib/server/utils";
import { requireStoreRead } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";
import { scrubWaitlistEntries } from "@/lib/viewer-payloads";

/** Lista de espera de la preventa de un producto: la dueña la lee y anota; solo lectura ve conteos y filas sin contacto. */
export async function GET(req: Request, { params }: { params: { storeId: string } }) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const access = await requireStoreRead(params.storeId);
    const productId = new URL(req.url).searchParams.get("productId")?.trim();
    if (!productId) throw ErrorFactory.InvalidRequest("Falta el producto");

    const [rows, counts] = await Promise.all([
      prismadb.preorderWaitlistEntry.findMany({
        where: { storeId: params.storeId, productId },
        select: WAITLIST_ENTRY_SELECT,
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      getWaitlistCounts(params.storeId, productId),
    ]);

    const entries = access.role === "viewer" ? scrubWaitlistEntries(rows) : rows;
    return NextResponse.json({ entries, counts }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PREORDER_WAITLIST_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 401, 403],
    });
  }
}

/** Alta rápida desde el panel (WhatsApp, Instagram, TikTok u otro). No envía nada. */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const input = panelWaitlistEntrySchema.parse(await requireJsonBody(req, "PREORDER_WAITLIST_POST"));

    const product = await prismadb.product.findFirst({
      where: { id: input.productId, storeId: params.storeId },
      select: { id: true },
    });
    if (!product) throw ErrorFactory.NotFound("El producto no existe en esta tienda");

    // La preventa se resuelve aquí, nunca desde el cuerpo: así no se cuelga de una de otra tienda.
    const presale = await findActivePresale(params.storeId, product.id);

    const { entry, created } = await createOrReuseWaitlistEntry({
      storeId: params.storeId,
      productId: product.id,
      presaleId: presale?.id ?? null,
      name: input.name,
      phone: input.phone,
      handle: input.handle,
      email: input.email,
      channel: PreorderWaitlistChannel[input.channel],
      note: input.note,
      createdBy: userId,
    });

    return NextResponse.json({ entry, duplicate: !created }, { status: created ? 201 : 200, headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PREORDER_WAITLIST_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 401, 403, 404],
    });
  }
}
