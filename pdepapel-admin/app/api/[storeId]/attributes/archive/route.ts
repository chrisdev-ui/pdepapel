import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  attributeArchiveMessage,
  attributeRevalidationPaths,
  parseAttributeArchiveBody,
  setAttributesArchived,
} from "@/lib/attribute-archive";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Archiva o restaura atributos del catálogo (solo dueño de la tienda):
 * `{ kind: "types" | "categories" | "sizes" | "colors" | "designs", ids, archived }`.
 * Los productos que usan el atributo no cambian; la tienda deja de listarlo.
 */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const input = parseAttributeArchiveBody(await req.json().catch(() => ({})));
    const result = await prismadb.$transaction((tx) =>
      setAttributesArchived(tx, { storeId: params.storeId, input }),
    );

    await triggerStorefrontRevalidation({
      paths: attributeRevalidationPaths(result.categorySlugs),
      tags: ["categories", "products"],
    });

    return NextResponse.json(
      { message: attributeArchiveMessage(input, result.count), count: result.count },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "ATTRIBUTES_ARCHIVE_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
