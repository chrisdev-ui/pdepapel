import { auth } from "@clerk/nextjs/server";
import { PreorderWaitlistStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { WAITLIST_ENTRY_SELECT } from "@/lib/preorder-waitlist";
import { waitlistStatusPatchSchema } from "@/lib/preorder-waitlist-shared";
import prismadb from "@/lib/prismadb";
import { requireJsonBody } from "@/lib/request-body";
import { verifyStoreOwner } from "@/lib/server/utils";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * Estado a mano: contactada, descartada o de vuelta a esperando. «Con
 * anticipo» (CONVERTED) no se pone aquí: lo pone «Marcar anticipo recibido»
 * junto con el pedido, y una entrada convertida ya no se mueve.
 */
export async function PATCH(req: Request, { params }: { params: { storeId: string; entryId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const { status } = waitlistStatusPatchSchema.parse(await requireJsonBody(req, "PREORDER_WAITLIST_PATCH"));

    const entry = await prismadb.preorderWaitlistEntry.findFirst({
      where: { id: params.entryId, storeId: params.storeId },
      select: { id: true, status: true },
    });
    if (!entry) throw ErrorFactory.NotFound("No encontramos esa persona en la lista de espera");
    if (entry.status === PreorderWaitlistStatus.CONVERTED) {
      throw ErrorFactory.Conflict("Esta persona ya dejó anticipo: su estado no se cambia desde aquí");
    }

    const updated = await prismadb.preorderWaitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: PreorderWaitlistStatus[status],
        ...(status === "CONTACTED" ? { contactedAt: new Date() } : {}),
        ...(status === "WAITING" ? { contactedAt: null } : {}),
      },
      select: WAITLIST_ENTRY_SELECT,
    });

    return NextResponse.json(updated, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PREORDER_WAITLIST_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 401, 403, 404, 409],
    });
  }
}
