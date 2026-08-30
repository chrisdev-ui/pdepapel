import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const options = await prismadb.catalogOption.findMany({
      where: {
        storeId: params.storeId,
        isActive: true,
        productValues: { some: { product: { isArchived: false } } },
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        displayOrder: true,
        categories: {
          select: { categoryId: true },
          orderBy: { displayOrder: "asc" },
        },
        values: {
          where: {
            productValues: { some: { product: { isArchived: false } } },
          },
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            value: true,
            productValues: {
              where: { product: { isArchived: false } },
              select: {
                product: { select: { categoryId: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      options.map((option) => ({
        id: option.id,
        key: option.key,
        name: option.name,
        displayOrder: option.displayOrder,
        categoryIds: option.categories.map((item) => item.categoryId),
        values: option.values.map((value) => {
          const categoryCounts = value.productValues.reduce<
            Record<string, number>
          >((counts, productValue) => {
            const categoryId = productValue.product.categoryId;
            counts[categoryId] = (counts[categoryId] ?? 0) + 1;
            return counts;
          }, {});

          return {
            id: value.id,
            name: value.name,
            value: value.value,
            count: value.productValues.length,
            categoryCounts,
          };
        }),
      })),
      { headers: CACHE_HEADERS.DYNAMIC },
    );
  } catch (error) {
    return handleErrorResponse(error, "CATALOG_OPTIONS_GET");
  }
}
