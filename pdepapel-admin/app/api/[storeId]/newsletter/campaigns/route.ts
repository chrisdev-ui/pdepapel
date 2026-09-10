import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { sendNewsletterCampaign, type NewsletterCampaignKind } from "@/lib/newsletter-campaigns";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const maxDuration = 60;

const KINDS: NewsletterCampaignKind[] = ["early-access", "arrival"];

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = (await req.json().catch(() => ({}))) as { kind?: unknown; homeContentId?: unknown };
    if (!KINDS.includes(body.kind as NewsletterCampaignKind)) {
      throw ErrorFactory.InvalidRequest("El envío debe ser de acceso anticipado o de llegada");
    }
    if (typeof body.homeContentId !== "string" || !body.homeContentId) {
      throw ErrorFactory.InvalidRequest("Se requiere el banner de cargamento");
    }

    const result = await sendNewsletterCampaign({
      storeId: params.storeId,
      homeContentId: body.homeContentId,
      kind: body.kind as NewsletterCampaignKind,
    });

    return NextResponse.json(
      { ...result, message: `Enviado a ${result.sent} suscriptora${result.sent === 1 ? "" : "s"}` },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "NEWSLETTER_CAMPAIGNS_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
