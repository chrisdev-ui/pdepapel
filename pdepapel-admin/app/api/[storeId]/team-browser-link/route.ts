import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { requireStoreOwner } from "@/lib/store-access";
import { buildTeamBrowserLinks } from "@/lib/team-browser-link";

/** Solo la dueña: genera el enlace de cinco minutos que marca su navegador en la tienda. */
export async function POST(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireStoreOwner(params.storeId);
    const secret = process.env.REVALIDATION_SECRET?.trim();
    const storeUrl = process.env.FRONTEND_STORE_URL?.trim();
    if (!secret || !storeUrl) {
      throw ErrorFactory.InvalidRequest("Falta configurar la tienda para marcar el navegador.");
    }
    return NextResponse.json(buildTeamBrowserLinks(storeUrl, secret), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleErrorResponse(error, "TEAM_BROWSER_LINK_POST");
  }
}
