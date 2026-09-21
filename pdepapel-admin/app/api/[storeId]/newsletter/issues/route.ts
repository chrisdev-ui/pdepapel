import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  createNewsletterIssue,
  getPublicNewsletterIssue,
  listNewsletterIssues,
} from "@/lib/newsletter-issues";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function GET(req: Request, { params }: { params: { storeId: string } }) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const { searchParams } = new URL(req.url);

    /*
      Rama pública para la tienda: un número **ya enviado**, por su slug. Los
      borradores no salen nunca, y no se devuelve nada de las suscriptoras.
      Mismo patrón que `home-content?live=1`.
    */
    const publicSlug = searchParams.get("slug");
    if (publicSlug) {
      const issue = await getPublicNewsletterIssue(params.storeId, publicSlug);
      if (!issue) throw ErrorFactory.NotFound("El número no existe");
      return NextResponse.json(issue, { headers: CACHE_HEADERS.NO_CACHE });
    }

    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    return NextResponse.json(await listNewsletterIssues(params.storeId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "NEWSLETTER_ISSUES_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const issue = await createNewsletterIssue(params.storeId, await req.json().catch(() => ({})));
    return NextResponse.json(issue, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "NEWSLETTER_ISSUES_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
