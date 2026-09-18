import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  syncProductCatalogAttributes,
  visualCatalogAttributesSchema,
} from "@/lib/catalog-migration";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { createCorsHeaders } from "@/lib/cors";
import { parseTransportationCost } from "@/lib/product-costs";
import prismadb from "@/lib/prismadb";
import { PUBLIC_PRODUCT_DETAIL_SELECT } from "@/lib/public-catalog";
import { PUBLIC_REVIEW_INCLUDE } from "@/lib/review-moderation";
import { deleteCloudinaryImages } from "@/lib/cloudinary-cleanup";
import {
  CACHE_HEADERS,
  checkIfStoreOwner,
  currencyFormatter,
  verifyStoreOwner,
  generateRandomSKU,
} from "@/lib/utils";
import { generateSemanticSKU } from "@/lib/variant-generator";
import { generateProductSlug } from "@/lib/slugify";
import { parseAvailableAt } from "@/lib/product-availability";
import {
  findProductWithGtin,
  normalizeProductIdentifiers,
} from "@/lib/product-identifiers";
import { isPriceBelowCost, priceBelowCostMessage } from "@/lib/product-pricing-rules";
import {
  assertValidKitComponents,
  KIT_COMPOSITION_REASON,
  KIT_CONVERSION_REASON,
  KIT_DISSOLUTION_REASON,
  settleKitStock,
} from "@/lib/product-kit-conversion";
import { queueMarketplaceStockSyncEvents } from "@/lib/mercadolibre/outbox";
import { pauseMarketplaceListingsForProducts } from "@/lib/product-archive";
import {
  describeDeleteBlockers,
  getProductDeleteCheck,
} from "@/lib/product-deletion";
import { sanitizeRichTextHtml } from "@/lib/rich-text";
import {
  getUniqueProductSlug,
  preserveProductSlugAlias,
  synchronizeProductGroupSlugs,
} from "@/lib/product-slugs";
import { auth } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export async function OPTIONS(req: Request) {
  return NextResponse.json(
    {},
    {
      headers: createCorsHeaders(req, { methods: "GET, OPTIONS" }),
    },
  );
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  const isStorefrontRequest =
    new URL(req.url).searchParams.get("scope") === "storefront";
  const corsHeaders = {
    ...createCorsHeaders(req, { methods: "GET, OPTIONS" }),
    ...CACHE_HEADERS.DYNAMIC,
  };

  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");

    // La ruta no pide sesión (la tienda en línea la usa), así que la forma
    // depende de quién pregunta: la dueña del panel recibe la fila completa
    // (el selector de productos, el asistente de Mercado Libre y el
    // aprovisionamiento leen acqPrice y transportationCost de aquí); cualquier
    // otra persona recibe solo el `select` público, sin costos ni proveedor.
    const { userId } = await auth();
    const isOwner = await checkIfStoreOwner(userId, params.storeId);

    const ownerInclude = {
      images: true,
      category: true,
      size: true,
      color: true,
      design: true,
      productGroup: true,
      catalogOptionValues: {
        include: { option: true, optionValue: true },
      },
      supplier: true,
      reviews: PUBLIC_REVIEW_INCLUDE,
      kitComponents: {
        include: {
          component: {
            select: {
              id: true,
              name: true,
              stock: true,
              images: { where: { isMain: true } },
              sku: true,
            },
          },
        },
      },
    } as const;
    const findProduct = (where: Prisma.ProductWhereInput) =>
      isOwner
        ? prismadb.product.findFirst({ where, include: ownerInclude })
        : prismadb.product.findFirst({
            where,
            select: PUBLIC_PRODUCT_DETAIL_SELECT,
          });

    let product = await findProduct({
      storeId: params.storeId,
      ...(isStorefrontRequest ? { isArchived: false } : {}),
      OR: [{ id: params.productId }, { slug: params.productId }],
    });

    if (!product) {
      const alias = await prismadb.productSlugAlias.findUnique({
        where: {
          storeId_slug: {
            storeId: params.storeId,
            slug: params.productId,
          },
        },
        select: { productId: true },
      });

      if (alias) {
        product = await findProduct({
          id: alias.productId,
          storeId: params.storeId,
          ...(isStorefrontRequest ? { isArchived: false } : {}),
        });
      }
    }

    if (!product || (isStorefrontRequest && product.isArchived)) {
      throw ErrorFactory.NotFound("Producto no encontrado");
    }

    // Calculate discounted price
    const { calculateDiscountedPrice } = await import("@/lib/discount-engine");
    const productWithDiscount = await calculateDiscountedPrice(
      product,
      params.storeId,
    );

    return NextResponse.json(
      {
        ...product,
        price: productWithDiscount.price, // EFFECTIVE PRICE
        originalPrice: product.price, // BASE PRICE
        discountedPrice: productWithDiscount.price, // Alias
        offerLabel: productWithDiscount.offerLabel,
        hasDiscount: productWithDiscount.discount > 0,
      },
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_GET", {
      headers: corsHeaders,
      expectedStatusCodes: isStorefrontRequest ? [404] : undefined,
      logMetadata: isStorefrontRequest
        ? {
            requestSource: "storefront",
            productReference: params.productId,
          }
        : undefined,
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const {
      name,
      price,
      acqPrice,
      transportationCost,
      categoryId,
      colorId,
      sizeId,
      designId,
      supplierId,
      brand,
      gtin,
      mpn,
      hasNoProductIdentifier,
      description,
      stock,
      images,
      isArchived,
      isFeatured,
      availableAt,
      productGroupId,
      preserveSlug = false,
      allowBelowCost = false,

      isKit,
      components,
      catalogAttributes,
    } = body;
    const normalizedSupplierId =
      typeof supplierId === "string" && supplierId !== "none"
        ? supplierId || null
        : null;
    const normalizedProductGroupId =
      typeof productGroupId === "string" && productGroupId !== "none"
        ? productGroupId || null
        : null;
    const sanitizedDescription = sanitizeRichTextHtml(description);
    const parsedCatalogAttributes = Array.isArray(catalogAttributes)
      ? visualCatalogAttributesSchema.parse(catalogAttributes)
      : null;

    if (!name)
      throw ErrorFactory.InvalidRequest("El nombre del producto es requerido");
    if (!images || !images.length)
      throw ErrorFactory.InvalidRequest(
        "Las imágenes del producto son requeridas",
      );
    if (!price)
      throw ErrorFactory.InvalidRequest("El precio del producto es requerido");
    if (!categoryId)
      throw ErrorFactory.InvalidRequest(
        "La categoría del producto es requerida",
      );
    if (!sizeId)
      throw ErrorFactory.InvalidRequest("El tamaño del producto es requerido");
    if (!colorId)
      throw ErrorFactory.InvalidRequest("El color del producto es requerido");
    if (!designId)
      throw ErrorFactory.InvalidRequest("El diseño del producto es requerido");
    if (stock && stock < 0)
      throw ErrorFactory.InvalidRequest(
        "El stock del producto debe ser cero o mayor a cero",
      );

    let productIdentifiers;
    try {
      productIdentifiers = normalizeProductIdentifiers({
        gtin,
        mpn,
        hasNoProductIdentifier,
      });
    } catch (error) {
      throw ErrorFactory.InvalidRequest(
        error instanceof Error ? error.message : "Identificadores inválidos",
      );
    }

    // [NEW] Validate Kit Data
    if (isKit && (!components || components.length === 0)) {
      throw ErrorFactory.InvalidRequest(
        "Un Kit debe tener productos (componentes).",
      );
    }

    // Un precio por debajo del costo casi siempre es un error de dedo.
    if (!allowBelowCost && isPriceBelowCost(price, acqPrice)) {
      throw ErrorFactory.InvalidRequest(
        priceBelowCostMessage(Number(price), Number(acqPrice), currencyFormatter),
      );
    }

    const gtinOwner = await findProductWithGtin(prismadb, {
      storeId: params.storeId,
      gtin: productIdentifiers.gtin,
      excludeProductId: params.productId,
    });
    if (gtinOwner) {
      throw ErrorFactory.Conflict(
        `Ese GTIN ya está en «${gtinOwner.name}». Un código de barras identifica un solo producto.`,
        { productId: gtinOwner.id },
      );
    }

    if (normalizedSupplierId) {
      const supplier = await prismadb.supplier.findFirst({
        where: { id: normalizedSupplierId, storeId: params.storeId },
        select: { id: true },
      });
      if (!supplier) throw ErrorFactory.NotFound("Proveedor no encontrado");
    }

    if (normalizedProductGroupId) {
      const productGroup = await prismadb.productGroup.findFirst({
        where: { id: normalizedProductGroupId, storeId: params.storeId },
        select: { id: true },
      });
      if (!productGroup) {
        throw ErrorFactory.NotFound("Grupo de productos no encontrado");
      }
    }

    const productToUpdate = await prismadb.product.findUnique({
      where: { id: params.productId, storeId: params.storeId },
      include: { images: true },
    });

    if (!productToUpdate)
      throw ErrorFactory.NotFound(
        `El Producto ${params.productId} no existe en esta tienda`,
      );

    if (isKit) {
      await assertValidKitComponents(prismadb, {
        storeId: params.storeId,
        kitId: params.productId,
        components,
      });
    }
    const becomesKit = Boolean(isKit) && !productToUpdate.isKit;
    const stopsBeingKit = !isKit && productToUpdate.isKit;
    let pausedListings = 0;

    const [categoryObj, designObj, colorObj, sizeObj] = await Promise.all([
      prismadb.category.findUnique({ where: { id: categoryId } }),
      prismadb.design.findUnique({ where: { id: designId } }),
      prismadb.color.findUnique({ where: { id: colorId } }),
      prismadb.size.findUnique({ where: { id: sizeId } }),
    ]);

    // SKU Regeneration for Manual Items
    let newSku: string | undefined = undefined;
    if (productToUpdate.sku.startsWith("MAN-")) {
      if (categoryObj && designObj && colorObj && sizeObj) {
        newSku = generateSemanticSKU(
          categoryObj.name,
          designObj.name,
          colorObj.name,
          sizeObj.value || sizeObj.name,
        );
      }
    }

    let uniqueSlug = productToUpdate.slug;
    if (!preserveSlug) {
      let updatedSlug = generateProductSlug({ name });
      if (!updatedSlug) updatedSlug = "producto";

      uniqueSlug = await getUniqueProductSlug(prismadb, {
        storeId: params.storeId,
        baseSlug: updatedSlug,
        excludeProductId: params.productId,
      });
    }
    const targetProductGroupId = normalizedProductGroupId;
    const affectedProductGroupIds = Array.from(
      new Set(
        [productToUpdate.productGroupId, targetProductGroupId].filter(
          (groupId): groupId is string => Boolean(groupId),
        ),
      ),
    );

    const currentImageUrls = productToUpdate.images.map((image) => image.url);
    const newImageUrls = images.map((image: { url: string }) => image.url);
    const imagesToDelete = currentImageUrls.filter(
      (url) => !newImageUrls.includes(url),
    );

    const result = await prismadb.$transaction(async (tx) => {
      // Update product
      await tx.product.update({
        where: { id: params.productId },
        data: {
          name,
          slug: uniqueSlug,
          ...(newSku && { sku: newSku }),
          price,
          acqPrice,
          transportationCost: parseTransportationCost(transportationCost),
          categoryId,
          colorId,
          sizeId,
          designId,
          supplierId: normalizedSupplierId,
          brand: typeof brand === "string" ? brand.trim() || null : null,
          ...productIdentifiers,
          isArchived,
          isFeatured,
          availableAt: parseAvailableAt(availableAt),
          productGroupId: targetProductGroupId,
          description: sanitizedDescription,
          // [NEW] Update Kit info
          isKit: isKit || false,
          // Al dejar de ser kit se sueltan los componentes; antes quedaban
          // filas huérfanas y el stock congelado sin movimiento.
          kitComponents: isKit
            ? {
                deleteMany: {}, // Wipe old
                create: components.map((c: any) => ({
                  componentId: c.componentId,
                  quantity: c.quantity || 1,
                })),
              }
            : stopsBeingKit
              ? { deleteMany: {} }
              : undefined,
        },
      });

      // Archivar saca el producto de la tienda; su publicación en Mercado
      // Libre seguía vendiendo. Se encola la pausa. Restaurar no la reactiva.
      if (isArchived && !productToUpdate.isArchived) {
        pausedListings = await pauseMarketplaceListingsForProducts(tx, [
          params.productId,
        ]);
      }

      // El stock de un kit se deriva de sus componentes. Cualquier salto de
      // la columna queda como movimiento, dentro de la misma transacción.
      if (becomesKit || stopsBeingKit || isKit) {
        const settled = await settleKitStock(tx, {
          storeId: params.storeId,
          productId: params.productId,
          reason: becomesKit
            ? KIT_CONVERSION_REASON
            : stopsBeingKit
              ? KIT_DISSOLUTION_REASON
              : KIT_COMPOSITION_REASON,
          createdBy: `USER_${userId}`,
          skipWhenUnchanged: !becomesKit && !stopsBeingKit,
        });
        if (settled.quantity !== 0) {
          await queueMarketplaceStockSyncEvents(tx, [params.productId]);
        }
      }

      // Prisma 6: explicit image replacement for optional relations
      await tx.image.deleteMany({
        where: { productId: params.productId },
      });
      await tx.image.createMany({
        data: images.map((image: { url: string; isMain?: boolean }) => ({
          url: image.url,
          isMain: image.isMain ?? false,
          productId: params.productId,
        })),
      });

      if (parsedCatalogAttributes) {
        await syncProductCatalogAttributes(tx, {
          storeId: params.storeId,
          productId: params.productId,
          categoryId,
          attributes: parsedCatalogAttributes,
        });
      }

      if (!preserveSlug) {
        // La URL anterior queda como redirección SIEMPRE que cambie, también
        // en variantes de grupo: antes se saltaba y el enlace viejo daba 404.
        if (productToUpdate.slug !== uniqueSlug) {
          await preserveProductSlugAlias(tx, {
            storeId: params.storeId,
            productId: productToUpdate.id,
            slug: productToUpdate.slug,
          });
        }

        for (const groupId of affectedProductGroupIds) {
          await synchronizeProductGroupSlugs(tx, params.storeId, groupId);
        }
      }

      // Return updated product
      return await tx.product.findUnique({
        where: { id: params.productId },
        include: { images: true },
      });

      // Calculate Stock for Kit after update
      // We can't await inside the return easily for the result, so we just run it.
      // But we are in a transaction.
      // Actually we need to wait for this update to finish before calculating stock?
      // No, we are in transaction 'tx'. We can recalculate using 'tx'.
    });

    // Las fotos quitadas se borran de Cloudinary solo después de que la base
    // confirmó el guardado; antes iban dentro de la transacción y un fallo a
    // medias dejaba filas apuntando a archivos inexistentes.
    await deleteCloudinaryImages(imagesToDelete, "PRODUCT_PATCH");

    // Invalidate product cache & trigger instant storefront revalidation
    await invalidateStoreProductsCache(params.storeId, params.productId);

    return NextResponse.json(
      { ...result, pausedListings },
      {
        headers: CACHE_HEADERS.NO_CACHE,
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");

    await verifyStoreOwner(userId, params.storeId);

    const imageUrlsToDelete: string[] = [];
    await prismadb.$transaction(async (tx) => {
      // Se nombra lo que bloquea (pedidos, kits, Mercado Libre, ferias,
      // reposición, preventa, kardex) en vez de un error genérico de relación.
      const check = await getProductDeleteCheck(tx, {
        storeId: params.storeId,
        productId: params.productId,
      });
      if (!check)
        throw ErrorFactory.NotFound(
          `El Producto ${params.productId} no existe en esta tienda`,
        );
      if (check.blocked) {
        throw ErrorFactory.Conflict(
          `No se puede eliminar «${check.name}». ${describeDeleteBlockers(check)} Archívalo en su lugar.`,
          { blockers: JSON.stringify(check.blockers) },
        );
      }

      const product = await tx.product.findUnique({
        where: { id: params.productId, storeId: params.storeId },
        include: { images: true },
      });
      if (!product)
        throw ErrorFactory.NotFound(
          `El Producto ${params.productId} no existe en esta tienda`,
        );

      imageUrlsToDelete.push(...product.images.map((image) => image.url));

      // Delete related records first
      await tx.review.deleteMany({
        where: { productId: params.productId, storeId: params.storeId },
      });

      await tx.image.deleteMany({
        where: { productId: params.productId },
      });

      // Finally delete the product
      await tx.product.delete({
        where: { id: params.productId, storeId: params.storeId },
      });
    });

    await deleteCloudinaryImages(imageUrlsToDelete, "PRODUCT_DELETE");

    // Invalidate product cache & trigger instant storefront revalidation
    await invalidateStoreProductsCache(params.storeId, params.productId);

    return NextResponse.json("El producto ha sido eliminado correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
