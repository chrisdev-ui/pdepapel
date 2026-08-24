import { auth } from "@clerk/nextjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { createInventoryMovementBatch } from "@/lib/inventory";
import { synchronizeProductGroupSlugs } from "@/lib/product-slugs";
import prismadb from "@/lib/prismadb";
import { slugify } from "@/lib/slugify";
import { generateSemanticSKU } from "@/lib/variant-generator";
import { verifyStoreOwner } from "@/lib/utils";

const MAX_VARIANT_REVIEW_OPTIONS = 3;

const existingAttributeSchema = z.object({
  mode: z.literal("existing"),
  id: z.string().uuid(),
});

const newAttributeSchema = z.object({
  mode: z.literal("new"),
  name: z.string().trim().min(1).max(80),
  value: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

const reviewConversionSchema = z.object({
  name: z.string().trim().min(1).max(180),
  variants: z
    .array(
      z.object({
        imageUrl: z.string().url(),
        keepExistingProduct: z.boolean(),
        stock: z.number().int().min(0),
        color: z.union([existingAttributeSchema, newAttributeSchema]),
        design: z.union([existingAttributeSchema, newAttributeSchema]),
        sizeId: z.string().uuid(),
      }),
    )
    .min(2)
    .max(MAX_VARIANT_REVIEW_OPTIONS),
});

type ReviewConversionBody = z.infer<typeof reviewConversionSchema>;
type ResolvedVariant = Omit<
  ReviewConversionBody["variants"][number],
  "color" | "design"
> & {
  color: { id: string; name: string; value: string };
  design: { id: string; name: string };
  size: { id: string; name: string; value: string };
};

async function getUniqueSemanticSku(
  tx: Prisma.TransactionClient,
  input: {
    categoryName: string;
    colorName: string;
    designName: string;
    sizeName: string;
  },
) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const sku = generateSemanticSKU(
      input.categoryName,
      input.designName,
      input.colorName,
      input.sizeName,
    );
    const existingProduct = await tx.product.findUnique({
      where: { sku },
      select: { id: true },
    });
    if (!existingProduct) return sku;
  }

  throw ErrorFactory.Conflict(
    "No se pudo generar un SKU único. Intenta nuevamente.",
  );
}

async function resolveColor(
  tx: Prisma.TransactionClient,
  storeId: string,
  input: ReviewConversionBody["variants"][number]["color"],
) {
  if (input.mode === "existing") {
    const color = await tx.color.findFirst({
      where: { id: input.id, storeId },
      select: { id: true, name: true, value: true },
    });
    if (!color) {
      throw ErrorFactory.InvalidRequest("El color seleccionado no existe");
    }
    return color;
  }

  if (!input.value) {
    throw ErrorFactory.InvalidRequest(
      "Un color nuevo debe incluir un tono hexadecimal válido",
    );
  }

  const existingColor = await tx.color.findFirst({
    where: { storeId, name: input.name },
    select: { id: true, name: true, value: true },
  });
  if (existingColor) return existingColor;

  return tx.color.create({
    data: { storeId, name: input.name, value: input.value.toUpperCase() },
    select: { id: true, name: true, value: true },
  });
}

async function resolveDesign(
  tx: Prisma.TransactionClient,
  storeId: string,
  input: ReviewConversionBody["variants"][number]["design"],
) {
  if (input.mode === "existing") {
    const design = await tx.design.findFirst({
      where: { id: input.id, storeId },
      select: { id: true, name: true },
    });
    if (!design) {
      throw ErrorFactory.InvalidRequest("El diseño seleccionado no existe");
    }
    return design;
  }

  const existingDesign = await tx.design.findFirst({
    where: { storeId, name: input.name },
    select: { id: true, name: true },
  });
  if (existingDesign) return existingDesign;

  return tx.design.create({
    data: { storeId, name: input.name },
    select: { id: true, name: true },
  });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId) {
      throw ErrorFactory.InvalidRequest("Se requiere el producto a convertir");
    }

    const body = reviewConversionSchema.parse(await req.json());
    if (
      body.variants.filter((variant) => variant.keepExistingProduct).length !==
      1
    ) {
      throw ErrorFactory.InvalidRequest(
        "Selecciona exactamente una opción para conservar el producto actual",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const product = await prismadb.product.findFirst({
      where: { id: params.productId, storeId: params.storeId },
      include: { images: true },
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

    const productImageUrls = new Set(product.images.map((image) => image.url));
    if (
      body.variants.some((variant) => !productImageUrls.has(variant.imageUrl))
    ) {
      throw ErrorFactory.InvalidRequest(
        "Cada opción debe usar una imagen que pertenezca al producto actual",
      );
    }
    if (
      new Set(body.variants.map((variant) => variant.imageUrl)).size !==
      body.variants.length
    ) {
      throw ErrorFactory.InvalidRequest(
        "Selecciona una foto distinta para cada opción",
      );
    }
    if (
      body.variants.reduce((total, variant) => total + variant.stock, 0) !==
      product.stock
    ) {
      throw ErrorFactory.InvalidRequest(
        "Distribuye exactamente todo el inventario actual entre las opciones",
      );
    }

    const result = await prismadb.$transaction(async (tx) => {
      const category = await tx.category.findFirst({
        where: { id: product.categoryId, storeId: params.storeId },
        select: { id: true, name: true },
      });
      if (!category) throw ErrorFactory.NotFound("Categoría no encontrada");

      const group = await tx.productGroup.create({
        data: {
          storeId: params.storeId,
          name: body.name,
          slug: slugify(body.name),
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

      const resolvedVariants: ResolvedVariant[] = [];
      for (const variant of body.variants) {
        const color = await resolveColor(tx, params.storeId, variant.color);
        const design = await resolveDesign(tx, params.storeId, variant.design);
        const size = await tx.size.findFirst({
          where: { id: variant.sizeId, storeId: params.storeId },
          select: { id: true, name: true, value: true },
        });
        if (!size) {
          throw ErrorFactory.InvalidRequest("El tamaño seleccionado no existe");
        }
        resolvedVariants.push({ ...variant, color, design, size });
      }

      const combinations = new Set<string>();
      for (const variant of resolvedVariants) {
        const combination = [
          variant.color.id,
          variant.design.id,
          variant.size.id,
        ].join(":");
        if (combinations.has(combination)) {
          throw ErrorFactory.InvalidRequest(
            "Cada variante necesita una combinación distinta de color, diseño y tamaño",
          );
        }
        combinations.add(combination);
      }

      const existingVariant = resolvedVariants.find(
        (variant) => variant.keepExistingProduct,
      );
      if (!existingVariant) {
        throw ErrorFactory.InvalidRequest("Selecciona el producto actual");
      }

      const sourceUpdated = await tx.product.updateMany({
        where: {
          id: product.id,
          storeId: params.storeId,
          productGroupId: null,
          stock: product.stock,
        },
        data: {
          productGroupId: group.id,
          colorId: existingVariant.color.id,
          designId: existingVariant.design.id,
          sizeId: existingVariant.size.id,
        },
      });
      if (sourceUpdated.count !== 1) {
        throw ErrorFactory.Conflict(
          "El inventario cambió mientras revisabas las variantes. Actualiza la página e inténtalo nuevamente.",
        );
      }

      await tx.image.deleteMany({ where: { productId: product.id } });
      await tx.image.create({
        data: {
          productId: product.id,
          url: existingVariant.imageUrl,
          isMain: true,
        },
      });

      const newVariants = resolvedVariants.filter(
        (variant) => !variant.keepExistingProduct,
      );
      const createdProducts: Array<{ id: string; stock: number }> = [];
      for (const variant of newVariants) {
        const sku = await getUniqueSemanticSku(tx, {
          categoryName: category.name,
          colorName: variant.color.name,
          designName: variant.design.name,
          sizeName: variant.size.value || variant.size.name,
        });
        const createdProduct = await tx.product.create({
          data: {
            storeId: params.storeId,
            categoryId: product.categoryId,
            name: product.name,
            slug: "",
            description: product.description,
            stock: 0,
            price: product.price,
            acqPrice: product.acqPrice,
            isFeatured: product.isFeatured,
            isArchived: false,
            sizeId: variant.size.id,
            colorId: variant.color.id,
            designId: variant.design.id,
            sku,
            brand: product.brand,
            hasNoProductIdentifier: true,
            supplierId: product.supplierId,
            productGroupId: group.id,
            images: { create: { url: variant.imageUrl, isMain: true } },
          },
          select: { id: true },
        });
        createdProducts.push({ id: createdProduct.id, stock: variant.stock });
      }

      const inventoryMovements = [
        {
          productId: product.id,
          storeId: params.storeId,
          type: "MANUAL_ADJUSTMENT" as const,
          quantity: existingVariant.stock - product.stock,
          reason: "Distribución de inventario al crear variantes",
          description:
            "Inventario distribuido desde un producto individual al crear sus variantes.",
          cost: product.acqPrice ?? undefined,
          price: product.price,
          createdBy: `USER_${userId}`,
        },
        ...createdProducts.map((createdProduct) => ({
          productId: createdProduct.id,
          storeId: params.storeId,
          type: "MANUAL_ADJUSTMENT" as const,
          quantity: createdProduct.stock,
          reason: "Distribución de inventario al crear variantes",
          description:
            "Inventario distribuido desde un producto individual al crear sus variantes.",
          cost: product.acqPrice ?? undefined,
          price: product.price,
          createdBy: `USER_${userId}`,
        })),
      ].filter((movement) => movement.quantity !== 0);

      await createInventoryMovementBatch(tx, inventoryMovements, true);
      await synchronizeProductGroupSlugs(tx, params.storeId, group.id);

      return { group, createdProducts };
    });

    await invalidateStoreProductsCache(params.storeId);
    return NextResponse.json({
      productGroupId: result.group.id,
      createdProductIds: result.createdProducts.map((product) => product.id),
    });
  } catch (error) {
    console.error("[PRODUCT_CONVERT_TO_VARIANTS_REVIEW_POST]", error);
    return handleErrorResponse(
      error,
      "PRODUCT_CONVERT_TO_VARIANTS_REVIEW_POST",
    );
  }
}
