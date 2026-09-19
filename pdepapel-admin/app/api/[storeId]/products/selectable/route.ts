import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { handleErrorResponse } from "@/lib/api-errors";
import { buildSelectableWhere } from "@/lib/product-pickers";
import { checkIfStoreOwner } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }
    if (!(await checkIfStoreOwner(userId, params.storeId))) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("search") || ""; // ComponentSelector uses 'search'
    const page = parseInt(searchParams.get("page") || "1");
    // Limit is hardcoded to 20 in ComponentSelector, but good to handle param
    const limit = parseInt(searchParams.get("limit") || "20");
    // El propio kit nunca aparece como componente de sí mismo.
    const excludeId = searchParams.get("excludeId") || undefined;
    // Escaneo: un id concreto, sometido a las mismas reglas que la lista.
    const id = searchParams.get("id") || undefined;

    const whereClause = buildSelectableWhere({ storeId: params.storeId, query, excludeId, id });

    const products = await prismadb.product.findMany({
      where: whereClause,
      include: {
        images: true,
        category: true,
        // Include other relations if needed for display in selector
        color: true,
        size: true,
        design: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip: (page - 1) * limit,
    });

    // We wrap in a similar response structure as useSWRInfinite expects,
    // OR we just return the array if we change the fetcher.
    // The current fetcher likely expects the standard structure if it shares code.
    // ComponentSelector uses:
    /*
      const { data, ... } = useSWRInfinite(...)
      products = data ? data.flatMap((page) => page.products) : [];
    */
    // The existing API returns { products: [], totalItems: ..., ... }
    // So we should mimic that structure to minimize frontend changes.

    const totalItems = await prismadb.product.count({ where: whereClause });
    const totalPages = Math.ceil(totalItems / limit);

    return NextResponse.json({
      products,
      totalItems,
      totalPages,
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_SELECTABLE_GET");
  }
}
