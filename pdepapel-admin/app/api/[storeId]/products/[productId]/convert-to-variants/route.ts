import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import prismadb from "@/lib/prismadb";
import { slugify } from "@/lib/slugify";
import { verifyStoreOwner } from "@/lib/utils";

type ConvertToVariantsBody = {
  name?: unknown;
};

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    const { userId } = auth();
    const body = (await req.json()) as ConvertToVariantsBody;
    const groupName = typeof body.name === "string" ? body.name.trim() : "";

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("Se requiere el producto a convertir");
    if (!groupName)
      throw ErrorFactory.InvalidRequest("El nombre del grupo es requerido");

    await verifyStoreOwner(userId, params.storeId);

    const product = await prismadb.product.findFirst({
      where: {
        id: params.productId,
        storeId: params.storeId,
      },
      include: {
        images: true,
      },
    });

    if (!product) throw ErrorFactory.NotFound("Producto no encontrado");
    if (product.productGroupId) {
      throw ErrorFactory.Conflict("Este producto ya pertenece a un grupo");
    }
    if (product.isArchived) {
      throw ErrorFactory.Conflict(
        "Reactiva el producto antes de convertirlo en variantes",
      );
    }
    if (product.isKit) {
      throw ErrorFactory.Conflict(
        "Los combos no se pueden convertir en variantes directamente",
      );
    }
    if (product.images.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Agrega al menos una imagen antes de convertir el producto",
      );
    }

    const productGroup = await prismadb.$transaction(async (tx) => {
      const group = await tx.productGroup.create({
        data: {
          storeId: params.storeId,
          name: groupName,
          slug: slugify(groupName),
          description: product.description || "",
          brand: product.brand,
          images: {
            createMany: {
              data: product.images.map((image) => ({
                url: image.url,
                isMain: image.isMain,
              })),
            },
          },
        },
      });

      const updatedProduct = await tx.product.updateMany({
        where: {
          id: product.id,
          storeId: params.storeId,
          productGroupId: null,
        },
        data: {
          productGroupId: group.id,
        },
      });

      if (updatedProduct.count !== 1) {
        throw ErrorFactory.Conflict(
          "El producto cambió mientras se convertía. Actualiza la página e inténtalo de nuevo",
        );
      }

      return group;
    });

    await invalidateStoreProductsCache(params.storeId, product.id);

    return NextResponse.json({
      productGroupId: productGroup.id,
    });
  } catch (error) {
    console.error("[PRODUCT_CONVERT_TO_VARIANTS_POST]", error);
    return handleErrorResponse(error, "PRODUCT_CONVERT_TO_VARIANTS_POST");
  }
}
