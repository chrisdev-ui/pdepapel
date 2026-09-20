import { scrubProductGroup } from "@/lib/viewer-payloads";
import { requireStoreRead } from "@/lib/store-access";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { generateProductSlug, slugify } from "@/lib/slugify";
import {
  deleteGroupedVariantKeepingUrls,
  getUniqueProductSlug,
  synchronizeProductGroupSlugs,
} from "@/lib/product-slugs";
import { sanitizeRichTextHtml } from "@/lib/rich-text";
import { assertNoStandaloneConflicts } from "@/lib/product-group-conflicts";
import { resolveVariantImages } from "@/lib/variant-images";
import { hasDuplicateVariantCombination } from "@/lib/variant-combinations";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { findProductWithGtin } from "@/lib/product-identifiers";
import { deleteCloudinaryImages } from "@/lib/cloudinary-cleanup";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { pauseMarketplaceListingsForProducts } from "@/lib/product-archive";
import { getProductDeleteCheck } from "@/lib/product-deletion";
import {
  buildVariantData,
  collectArchiveTransitions,
  describeRemovals,
  findDuplicateVariantId,
  loadAdoptableProducts,
  resolveVariantRemovals,
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
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; productGroupId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productGroupId) {
      throw ErrorFactory.InvalidRequest("Product Group ID is required");
    }
    // Solo el panel: devuelve las variantes como filas completas de Product.
    const access = await requireStoreRead(params.storeId);

    const productGroup = await prismadb.productGroup.findFirst({
      where: {
        storeId: params.storeId,
        OR: [{ id: params.productGroupId }, { slug: params.productGroupId }],
      },
      include: {
        images: true,
        products: {
          include: {
            images: true,
            color: true,
            size: true,
            design: true,
          },
        },
      },
    });

    if (!productGroup) throw ErrorFactory.NotFound("Product Group not found");

    return NextResponse.json(access.role === "viewer" ? scrubProductGroup(productGroup) : productGroup, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_GROUP_GET", {
      headers: corsHeaders,
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; productGroupId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productGroupId)
      throw ErrorFactory.InvalidRequest("Product Group ID is required");
    await verifyStoreOwner(userId, params.storeId);
    const body = await req.json().catch(() => {
      throw ErrorFactory.InvalidRequest("El cuerpo de la petición no es JSON válido");
    });

    const {
      name,
      brand,
      description,
      images,
      imageMapping,
      defaultPrice,
      defaultCost,
      defaultSupplier,
      isFeatured,
      isArchived,
      categoryId,
      variants: variantsPayload,
      preserveSlug = false,
      confirmRemovals = false,
    } = body as Record<string, any>;
    const sanitizedDescription = sanitizeRichTextHtml(description);

    if (!name) throw ErrorFactory.InvalidRequest("Name is required");
    if (!images || !images.length)
      throw ErrorFactory.InvalidRequest("Images are required");
    if (!variantsPayload || !Array.isArray(variantsPayload)) {
      throw ErrorFactory.InvalidRequest("Variants array is required");
    }
    const variants = variantsPayload as VariantPayload[];
    if (hasDuplicateVariantCombination(variants)) {
      throw ErrorFactory.InvalidRequest(
        "No se pueden guardar dos variantes con la misma combinación de tamaño, color y diseño.",
      );
    }
    const duplicateId = findDuplicateVariantId(variants);
    if (duplicateId) {
      throw ErrorFactory.InvalidRequest(
        "La misma variante aparece dos veces en el grupo. Quita la fila repetida.",
        { productId: duplicateId },
      );
    }
    for (const variant of variants) {
      const { sizeId, colorId, designId } = variantAttributeIds(variant);
      if (!sizeId || !colorId || !designId) {
        const missing = [
          !sizeId && "tamaño",
          !colorId && "color",
          !designId && "diseño",
        ].filter(Boolean);
        throw ErrorFactory.InvalidRequest(
          `La variante "${variantLabel(variant)}" no se puede guardar: le falta ${missing.join(", ")}.`,
        );
      }
    }

    // Igual que al crear el grupo: una variante nueva no puede llamarse como
    // un producto suelto que ya existe.
    await assertNoStandaloneConflicts(
      prismadb,
      params.storeId,
      variants,
      name,
      { images, imageMapping },
    );

    // Fotos que existían antes (grupo y variantes): las que ninguna fila
    // conserve después del guardado se borran de Cloudinary tras confirmar.
    const previousImages = await prismadb.image.findMany({
      where: {
        OR: [
          { productGroupId: params.productGroupId },
          { product: { productGroupId: params.productGroupId } },
        ],
      },
      select: { url: true },
    });
    const previousImageUrls = previousImages.map((image) => image.url);

    let pausedListings = 0;
    let appliedRemovals: Awaited<ReturnType<typeof resolveVariantRemovals>> =
      [];

    const updatedGroup = await prismadb.$transaction(async (tx) => {
      const existingGroup = await tx.productGroup.findFirst({
        where: { id: params.productGroupId, storeId: params.storeId },
        select: { id: true, slug: true },
      });
      if (!existingGroup) {
        throw ErrorFactory.NotFound("Grupo de productos no encontrado");
      }

      // 1. Datos del grupo
      const group = await tx.productGroup.update({
        where: { id: params.productGroupId },
        data: {
          name,
          brand: typeof brand === "string" ? brand.trim() || null : null,
          slug: preserveSlug ? existingGroup.slug : slugify(name),
          description: sanitizedDescription,
        },
      });

      await tx.image.deleteMany({
        where: { productGroupId: params.productGroupId },
      });
      await tx.image.createMany({
        data: images.map((image: { url: string; isMain?: boolean }) => ({
          url: image.url,
          isMain: image.isMain ?? false,
          productGroupId: params.productGroupId,
        })),
      });

      // 2. Variantes actuales del grupo (de esta tienda) y productos que el
      //    formulario quiere conservar o adoptar: cada id se valida por
      //    tienda, grupo, kit y archivado antes de tocar nada.
      const existingProducts = await tx.product.findMany({
        where: { productGroupId: params.productGroupId, storeId: params.storeId },
        select: {
          id: true,
          name: true,
          sku: true,
          slug: true,
          isArchived: true,
          createdAt: true,
        },
      });
      const referenced = await loadAdoptableProducts(tx, {
        storeId: params.storeId,
        groupId: params.productGroupId,
        variants,
      });
      const payloadIds = new Set(
        variants.map((variant) => variant.id).filter(Boolean) as string[],
      );

      // 3. Bajas: la misma revisión que «Eliminar» en la ficha. Con bloqueos
      //    se archiva y sigue en el grupo; libre se elimina y su URL redirige
      //    a una hermana. El cliente tiene que haber visto la lista.
      const productsToRemove = existingProducts.filter(
        (product) => !payloadIds.has(product.id),
      );
      const removals = await resolveVariantRemovals(tx, {
        storeId: params.storeId,
        products: productsToRemove,
      });
      if (removals.length > 0 && confirmRemovals !== true) {
        throw ErrorFactory.Conflict(
          `Este guardado quitaría ${removals.length} ${
            removals.length === 1 ? "variante" : "variantes"
          } del grupo: ${describeRemovals(removals)}. Confirma la operación para continuar.`,
          { removals },
        );
      }

      const survivor = existingProducts
        .filter((product) => payloadIds.has(product.id) && !product.isArchived)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

      const archivedByRemoval: string[] = [];
      for (const removal of removals) {
        const product = productsToRemove.find((row) => row.id === removal.id)!;
        if (removal.action === "archive") {
          await tx.product.update({
            where: { id: product.id, storeId: params.storeId },
            data: { isArchived: true },
          });
          if (!product.isArchived) archivedByRemoval.push(product.id);
        } else if (survivor) {
          await deleteGroupedVariantKeepingUrls(tx, {
            storeId: params.storeId,
            product,
            redirectToProductId: survivor.id,
          });
        } else {
          await tx.product.delete({ where: { id: product.id } });
        }
      }
      appliedRemovals = removals;

      // 4. Atributos y subcategoría de todas las filas de una vez (y de esta tienda).
      await assertStoreCategory(tx, params.storeId, categoryId);
      const attributes = await loadVariantAttributes(tx, params.storeId, variants);

      // 5. Altas y cambios, fila por fila (una transacción serializable no
      //    gana nada con Promise.all y sí pierde el orden de los errores).
      const nextArchived = new Map<string, boolean | undefined>();
      for (const variant of variants) {
        const ids = variantAttributeIds(variant) as {
          sizeId: string;
          colorId: string;
          designId: string;
        };
        const { colorObj, designObj, sizeObj } = attributes.resolve(ids, variant);
        const existing = variant.id ? referenced.get(variant.id) : undefined;
        const isNew = !existing;

        const data = buildVariantData({
          variant,
          defaults: {
            name,
            description: sanitizedDescription,
            categoryId,
            price: defaultPrice,
            acqPrice: defaultCost,
            supplierId: defaultSupplier,
            isFeatured,
            isArchived,
          },
          isNew,
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
        const imageData = applicableImages.map(
          (img: { url: string; isMain?: boolean }) => ({
            url: img.url,
            isMain: img.isMain || false,
          }),
        );

        if (existing) {
          // Existente o adoptada: solo cambia lo que la fila trae; su slug y
          // su URL se conservan (la sincronización de slugs escribe alias).
          await tx.product.update({
            where: { id: existing.id, storeId: params.storeId },
            data: { ...data, productGroupId: params.productGroupId },
          });
          nextArchived.set(existing.id, data.isArchived);
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
          // Una variante nueva nace con 0 unidades, como cualquier producto
          // nuevo: las existencias entran por Inventario, con su movimiento.
          await tx.product.create({
            data: {
              ...data,
              name: variantName,
              sku: variant.sku,
              slug,
              stock: 0,
              storeId: params.storeId,
              productGroupId: params.productGroupId,
              categoryId: data.categoryId ?? attributes.categoryFallback(),
              isArchived: data.isArchived ?? false,
              isFeatured: data.isFeatured ?? false,
              price: data.price ?? 0,
              description: data.description ?? sanitizedDescription,
              images: { createMany: { data: imageData } },
            },
          });
        }
      }

      // 6. Archivar (por casilla del grupo, por fila o por baja con bloqueos)
      //    pausa la publicación de Mercado Libre, como en la ficha.
      const transitions = collectArchiveTransitions(existingProducts, nextArchived);
      pausedListings = await pauseMarketplaceListingsForProducts(tx, [
        ...transitions,
        ...archivedByRemoval,
      ]);

      if (!preserveSlug) {
        await synchronizeProductGroupSlugs(
          tx,
          params.storeId,
          params.productGroupId,
        );
      }

      return group;
    });

    await deleteCloudinaryImages(previousImageUrls, "PRODUCT_GROUP_PATCH");
    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(
      { ...updatedGroup, removals: appliedRemovals, pausedListings },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.log("[PRODUCT_GROUP_PATCH]", error);
    return handleErrorResponse(error, "PRODUCT_GROUP_PATCH", {
      headers: corsHeaders,
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; productGroupId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productGroupId)
      throw ErrorFactory.InvalidRequest("Product Group ID is required");
    await verifyStoreOwner(userId, params.storeId);

    const url = new URL(req.url);
    const deleteVariants = url.searchParams.get("deleteVariants") === "true";

    const imageUrlsToDelete: string[] = [];
    let ungrouped: {
      variants: { id: string; name: string }[];
      offersCarried: number;
      photosCopiedTo: number;
    } | null = null;
    const deletedGroup = await prismadb.$transaction(async (tx) => {
      // Todo filtrado por tienda: el grupo, sus variantes y sus fotos.
      const group = await tx.productGroup.findFirst({
        where: { id: params.productGroupId, storeId: params.storeId },
        select: { id: true },
      });
      if (!group) throw ErrorFactory.NotFound("Grupo de productos no encontrado");

      const children = await tx.product.findMany({
        where: { productGroupId: params.productGroupId, storeId: params.storeId },
        select: { id: true, name: true, images: { select: { url: true } } },
      });
      const groupImages = await tx.image.findMany({
        where: { productGroupId: params.productGroupId },
        select: { url: true, isMain: true },
      });
      imageUrlsToDelete.push(...groupImages.map((image) => image.url));

      if (deleteVariants) {
        // La misma revisión que «Eliminar» en la ficha, con nombres.
        const blocked: { id: string; name: string; blockers: string[] }[] = [];
        for (const child of children) {
          const check = await getProductDeleteCheck(tx, {
            storeId: params.storeId,
            productId: child.id,
          });
          if (check?.blocked) {
            blocked.push({
              id: child.id,
              name: child.name,
              blockers: check.blockers.map((blocker) => blocker.label),
            });
          }
        }
        if (blocked.length > 0) {
          throw ErrorFactory.Conflict(
            `No se puede eliminar el grupo con sus variantes: ${blocked
              .map((row) => `«${row.name}» (${row.blockers.join(", ").toLowerCase()})`)
              .join("; ")}. Archívalas o desvincula el grupo en su lugar.`,
            { blocked },
          );
        }
        imageUrlsToDelete.push(
          ...children.flatMap((child) => child.images.map((image) => image.url)),
        );
        await tx.product.deleteMany({
          where: { productGroupId: params.productGroupId, storeId: params.storeId },
        });
      } else {
        // «Desagrupar»: cada variante sigue siendo el mismo producto (SKU,
        // stock, kardex, pedidos, URL). Lo que era del grupo y se perdería
        // pasa a cada una: las ofertas del grupo y, para la variante sin
        // fotos propias, las fotos del grupo.
        const groupOffers = await tx.offerProductGroup.findMany({
          where: { productGroupId: params.productGroupId },
          select: { offerId: true },
        });
        const childIds = children.map((child) => child.id);
        const alreadyLinked =
          groupOffers.length > 0
            ? await tx.offerProduct.findMany({
                where: {
                  productId: { in: childIds },
                  offerId: { in: groupOffers.map((offer) => offer.offerId) },
                },
                select: { offerId: true, productId: true },
              })
            : [];
        const linked = new Set(
          alreadyLinked.map((row) => `${row.offerId}:${row.productId}`),
        );
        const offerRows = children.flatMap((child) =>
          groupOffers
            .filter((offer) => !linked.has(`${offer.offerId}:${child.id}`))
            .map((offer) => ({ offerId: offer.offerId, productId: child.id })),
        );
        if (offerRows.length > 0) {
          await tx.offerProduct.createMany({ data: offerRows });
        }
        const withoutPhotos = children.filter((child) => child.images.length === 0);
        const photoRows = withoutPhotos.flatMap((child) =>
          groupImages.map((image) => ({
            productId: child.id,
            url: image.url,
            isMain: image.isMain,
          })),
        );
        if (photoRows.length > 0) {
          await tx.image.createMany({ data: photoRows });
        }
        await tx.product.updateMany({
          where: { productGroupId: params.productGroupId, storeId: params.storeId },
          data: { productGroupId: null },
        });
        ungrouped = {
          variants: children.map((child) => ({ id: child.id, name: child.name })),
          offersCarried: offerRows.length,
          photosCopiedTo: photoRows.length > 0 ? withoutPhotos.length : 0,
        };
      }

      return tx.productGroup.delete({ where: { id: params.productGroupId } });
    });

    await deleteCloudinaryImages(imageUrlsToDelete, "PRODUCT_GROUP_DELETE");
    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json({ ...deletedGroup, ungrouped }, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_GROUP_DELETE]", error);
    return handleErrorResponse(error, "PRODUCT_GROUP_DELETE", {
      headers: corsHeaders,
    });
  }
}
