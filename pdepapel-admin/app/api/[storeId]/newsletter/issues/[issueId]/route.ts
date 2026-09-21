import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { deleteNewsletterIssue, updateNewsletterIssue } from "@/lib/newsletter-issues";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function PATCH(req: Request, { params }: { params: { storeId: string; issueId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const issue = await updateNewsletterIssue(params.storeId, params.issueId, await req.json().catch(() => ({})));
    return NextResponse.json(issue, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "NEWSLETTER_ISSUE_PATCH", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function DELETE(_req: Request, { params }: { params: { storeId: string; issueId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    await deleteNewsletterIssue(params.storeId, params.issueId);
    return NextResponse.json({ ok: true }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "NEWSLETTER_ISSUE_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
