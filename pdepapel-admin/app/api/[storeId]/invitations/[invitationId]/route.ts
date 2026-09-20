import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { requireInviter, revokeInvitation } from "@/lib/invitations";
import { CACHE_HEADERS } from "@/lib/utils";

/** Anula una invitación pendiente. Solo quien está en la lista explícita del dueño. */
export async function DELETE(_req: Request, { params }: { params: { storeId: string; invitationId: string } }) {
  try {
    await requireInviter(params.storeId);
    await revokeInvitation(params.invitationId);
    return NextResponse.json({ message: "Invitación anulada" }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "INVITATIONS_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
