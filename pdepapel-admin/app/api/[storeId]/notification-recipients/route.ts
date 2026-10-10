import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

function sameSecret(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * A quién manda la tienda en línea su formulario de contacto. Servidor a
 * servidor, con el mismo secreto de la revalidación (los dos proyectos ya lo
 * tienen): estas direcciones no van en `/public/storefront`, que es pública.
 */
export async function GET(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const expected = process.env.REVALIDATION_SECRET?.trim();
    if (!expected || !sameSecret(req.headers.get("x-revalidate-secret"), expected)) {
      throw ErrorFactory.Unauthorized();
    }
    const recipients = await getAdminNotificationRecipients(params.storeId);
    return NextResponse.json({ recipients }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "NOTIFICATION_RECIPIENTS_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
