import { scrubProductGroups } from "@/lib/viewer-payloads";
import { requireStoreRead } from "@/lib/store-access";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { generateProductSlug, slugify } from "@/lib/slugify";
import {
  getUniqueProductSlug,
  synchronizeProductGroupSlugs,
} from "@/lib/product-slugs";
import { sanitizeRichTextHtml } from "@/lib/rich-text";
import { verifyStoreOwner } from "@/lib/utils";
import { assertNoStandaloneConflicts } from "@/lib/product-group-conflicts";
import { resolveVariantImages, withVariantCover } from "@/lib/variant-images";
import { hasDuplicateVariantCombination } from "@/lib/variant-combinations";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { findProductWithGtin } from "@/lib/product-identifiers";
import { deleteCloudinaryImages } from "@/lib/cloudinary-cleanup";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { pauseMarketplaceListingsForProducts } from "@/lib/product-archive";
import {
  buildVariantData,
  findDuplicateVariantId,
  loadAdoptableProducts,
  variantAttributeIds,
  variantLabel,
  type VariantPayload,
} from "@/lib/product-group-save";
import {
  assertStoreCategory,
  loadVariantAttributes,
} from "@/lib/product-group-attributes";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);
    // El cuerpo se lee después de autorizar: un cuerpo vacío sin sesión
    // respondía 500 en vez de 401.
    const body = await req.json().catch(() => {
      throw ErrorFactory.InvalidRequest("El cuerpo de la petición no es JSON válido");
    });

    const {
      name,
      brand,
      description,
      images,
      imageMapping, // { url: string, scope: string }[]
      categoryId,
      defaultPrice,
      price, // Alias for defaultPrice
      defaultSupplier,
      defaultCost,
      acqPrice, // Alias for defaultCost
      isFeatured,
      isArchived,
      variants: variantsPayload,
    } = body as Record<string, any>;

    const effectiveDefaultPrice = defaultPrice ?? price;
    const effectiveDefaultCost = defaultCost ?? acqPrice;
    const sanitizedDescription = sanitizeRichTextHtml(description);

    if (!name) throw ErrorFactory.InvalidRequest("Name is required");
    if (!categoryId) throw ErrorFactory.InvalidRequest("Category is required");
    if (!images || !images.length)
      throw ErrorFactory.InvalidRequest("Images are required");
    if (!effectiveDefaultPrice)
      throw ErrorFactory.InvalidRequest("Default price is required");
    if (!variantsPayload || !variantsPayload.length) {
      throw ErrorFactory.InvalidRequest("Variants are required");
    }
    const variants = variantsPayload as VariantPayload[];
    if (hasDuplicateVariantCombination(variants)) {
      throw ErrorFactory.InvalidRequest(
        "No se pueden crear dos variantes con la misma combinación de tamaño, color y diseño.",
      );
    }
    const duplicateId = findDuplicateVariantId(variants);
    if (duplicateId) {
      throw ErrorFactory.InvalidRequest(
        "El mismo producto aparece dos veces en el grupo. Quita la fila repetida.",
        { productId: duplicateId },
      );
    }
    for (const variant of variants) {
      const { sizeId, colorId, designId } = variantAttributeIds(variant);
      if (!sizeId || !colorId || !designId) {
        // Antes se hacia `return` y la respuesta decia "creado" mientras la
        // variante nunca existia. Un grupo a medias es peor que un error.
        const missing = [
          !sizeId && "tamaño",
          !colorId && "color",
          !designId && "diseño",
        ].filter(Boolean);
        throw ErrorFactory.InvalidRequest(
          `La variante "${variantLabel(variant)}" no se puede crear: le falta ${missing.join(", ")}.`,
        );
      }
    }

    // Una variante sin id que se llama como un producto suelto sería un
    // duplicado con el inventario en el otro: 409 antes de crear nada.
    await assertNoStandaloneConflicts(
      prismadb,
      params.storeId,
      variants,
      name,
      { images, imageMapping },
    );
    // Fotos previas de los productos que se adoptan: se reemplazan por las del
    // grupo y, si ninguna fila las conserva, se borran de Cloudinary al final.
    const adoptedIds = variants
      .map((variant) => variant.id)
      .filter((id): id is string => Boolean(id));
    const adoptedImages = adoptedIds.length
      ? await prismadb.image.findMany({
          where: { productId: { in: adoptedIds } },
          select: { url: true },
        })
      : [];
    const previousImageUrls = adoptedImages.map((image) => image.url);

    let pausedListings = 0;
    const productGroup = await prismadb.$transaction(async (tx) => {
      await assertStoreCategory(tx, params.storeId, categoryId);
      // Los productos que se adoptan tienen que ser de la tienda, estar
      // sueltos, no ser kits ni estar archivados.
      const adopted = await loadAdoptableProducts(tx, {
        storeId: params.storeId,
        groupId: null,
        variants,
      });
      const attributes = await loadVariantAttributes(tx, params.storeId, variants);

      // 1. Create Product Group
      const group = await tx.productGroup.create({
        data: {
          storeId: params.storeId,
          name,
          brand: typeof brand === "string" ? brand.trim() || null : null,
          slug: slugify(name),
          description: sanitizedDescription,
          images: {
            createMany: {
              data: images.map((image: { url: string; isMain?: boolean }) => ({
                url: image.url,
                isMain: image.isMain ?? false,
              })),
            },
          },
        },
      });

      // 2. Variantes: adoptadas (solo cambia lo que trae la fila) y nuevas
      //    (con 0 unidades; las existencias entran por Inventario).
      const archivedNow: string[] = [];
      for (const variant of variants) {
        const ids = variantAttributeIds(variant) as {
          sizeId: string;
          colorId: string;
          designId: string;
        };
        const { colorObj, designObj, sizeObj } = attributes.resolve(ids, variant);
        const existing = variant.id ? adopted.get(variant.id) : undefined;
        const data = buildVariantData({
          variant,
          defaults: {
            name,
            description: sanitizedDescription,
            categoryId,
            price: effectiveDefaultPrice,
            acqPrice: effectiveDefaultCost,
            supplierId: defaultSupplier,
            isFeatured,
            isArchived,
          },
          isNew: !existing,
          attributes: ids,
        });

        if (data.gtin) {
          const owner = await findProductWithGtin(tx, {
            storeId: params.storeId,
            gtin: data.gtin,
            excludeProductId: existing?.id,
          });
          if (owner) {
            throw ErrorFactory.Conflict(
              `Ese GTIN ya está en «${owner.name}». Un código de barras identifica un solo producto.`,
              { productId: owner.id },
            );
          }
        }

        const applicableImages = resolveVariantImages({
          variantImages: variant.images,
          groupImages: images,
          imageMapping,
          colorId: ids.colorId,
          designId: ids.designId,
        });
        // `withVariantCover` asegura que quede exactamente una portada: si
        // ninguna foto viene marcada, asciende la primera. Sin esto una
        // variante podía guardarse sin portada y cada pantalla elegía una
        // distinta.
        const imageData = withVariantCover(
          applicableImages.map((img: { url: string; isMain?: boolean }) => ({
            url: img.url,
            isMain: img.isMain || false,
          })),
        );

        if (existing) {
          await tx.product.update({
            where: { id: existing.id, storeId: params.storeId },
            data: { ...data, productGroupId: group.id },
          });
          if (data.isArchived === true && !existing.isArchived) {
            archivedNow.push(existing.id);
          }
          await tx.image.deleteMany({ where: { productId: existing.id } });
          await tx.image.createMany({
            data: imageData.map((img) => ({ ...img, productId: existing.id })),
          });
        } else {
          if (!variant.sku) {
            throw ErrorFactory.InvalidRequest(
              `La variante «${variantLabel(variant)}» no tiene SKU.`,
            );
          }
          const variantName = data.name ?? name;
          const baseSlug =
            generateProductSlug({
              name: variantName,
              color: colorObj,
              design: designObj,
              size: sizeObj,
              includeVariantAttributes: variants.length > 1,
            }) || slugify(variantName) || "producto";
          const slug = await getUniqueProductSlug(tx, {
            storeId: params.storeId,
            baseSlug,
          });
          await tx.product.create({
            data: {
              ...data,
              name: variantName,
              sku: variant.sku,
              slug,
              stock: 0,
              storeId: params.storeId,
              productGroupId: group.id,
              categoryId,
              isArchived: data.isArchived ?? false,
              isFeatured: data.isFeatured ?? false,
              price: data.price ?? 0,
              description: data.description ?? sanitizedDescription,
              images: { createMany: { data: imageData } },
            },
          });
        }
      }

      pausedListings = await pauseMarketplaceListingsForProducts(tx, archivedNow);
      await synchronizeProductGroupSlugs(tx, params.storeId, group.id);

      return group;
    });

    await deleteCloudinaryImages(previousImageUrls, "PRODUCT_GROUPS_POST");
    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(
      { ...productGroup, pausedListings },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.log("[PRODUCT_GROUPS_POST]", error);
    return handleErrorResponse(error, "PRODUCT_GROUPS_POST", {
      headers: corsHeaders,
    });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    // Lista de administración: la tienda en línea agrupa variantes por
    // `GET /products?groupBy=parents`, nunca por aquí (devuelve filas
    // completas de Product, con costos y proveedor).
    const access = await requireStoreRead(params.storeId);

    // For admin dashboard list
    const productGroups = await prismadb.productGroup.findMany({
      where: {
        storeId: params.storeId,
      },
      include: {
        products: true, // Includes variant count
        images: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(access.role === "viewer" ? scrubProductGroups(productGroups) : productGroups, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_GROUPS_GET", {
      headers: corsHeaders,
    });
  }
}
