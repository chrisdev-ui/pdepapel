import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { createViewerInvitation, listPendingInvitations, requireInviter } from "@/lib/invitations";
import { CACHE_HEADERS } from "@/lib/utils";

/** Invitaciones pendientes. Solo quien está en la lista explícita del dueño. */
export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  try {
    const userId = await requireInviter(params.storeId);
    return NextResponse.json(await listPendingInvitations(userId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "INVITATIONS_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

/** Invita a una cuenta de solo lectura a una o más tiendas propias. */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const userId = await requireInviter(params.storeId);
    const body = await req.json().catch(() => ({}));
    const allowedStoreIds = Array.isArray(body?.allowedStoreIds) && body.allowedStoreIds.length > 0
      ? (body.allowedStoreIds as string[])
      : [params.storeId];
    const invitation = await createViewerInvitation({
      userId,
      emailAddress: String(body?.emailAddress ?? ""),
      allowedStoreIds,
    });
    return NextResponse.json(invitation, { status: 201, headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "INVITATIONS_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
