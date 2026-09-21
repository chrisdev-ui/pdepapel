import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { sendNewsletterIssue } from "@/lib/newsletter-campaigns";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** El envío por lotes puede tardar; el resto de rutas de campaña usan el mismo tope. */
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { storeId: string; issueId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const result = await sendNewsletterIssue({ storeId: params.storeId, issueId: params.issueId });
    return NextResponse.json(
      { ...result, message: `Enviado a ${result.sent} suscriptora${result.sent === 1 ? "" : "s"}` },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "NEWSLETTER_ISSUE_SEND", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
