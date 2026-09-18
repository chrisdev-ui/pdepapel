import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { parseAvailableAt } from "@/lib/product-availability";
import { pauseMarketplaceListingsForProducts } from "@/lib/product-archive";

const RELATION_FIELDS = [
  "categoryId",
  "colorId",
  "sizeId",
  "designId",
] as const;
const FLAG_FIELDS = [
  "isArchived",
  "isFeatured",
  "hasNoProductIdentifier",
] as const;
const DATE_FIELDS = ["availableAt"] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const maxDuration = 60;

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

    const body = await req.json();
    const { productIds, productGroupIds, field, value, preview = false } = body;

    const isRelation = RELATION_FIELDS.includes(field);
    const isFlag = FLAG_FIELDS.includes(field);
    const isDate = DATE_FIELDS.includes(field);
    if (!isRelation && !isFlag && !isDate) {
      throw ErrorFactory.InvalidRequest(
        "Campo no permitido para edición en lote",
      );
    }
    // La vista previa solo cuenta filas: el valor se valida al aplicar.
    if (!preview && isRelation && (typeof value !== "string" || !value)) {
      throw ErrorFactory.InvalidRequest("Elige un valor para aplicar");
    }
    if (!preview && isFlag && typeof value !== "boolean") {
      throw ErrorFactory.InvalidRequest(
        "Archivar, destacar o marcar sin identificador requiere un valor verdadero o falso",
      );
    }

    let dateValue: Date | null = null;
    if (isDate && !preview) {
      try {
        dateValue = parseAvailableAt(value);
      } catch (error) {
        throw ErrorFactory.InvalidRequest(
          error instanceof Error ? error.message : "Fecha inválida",
        );
      }
    }

    // Solo ids de esta tienda: un id ajeno o inventado no cuenta.
    const requested = Array.from(new Set<string>(productIds || []));
    const ownRows = requested.length
      ? await prismadb.product.findMany({
          where: { storeId: params.storeId, id: { in: requested } },
          select: { id: true },
        })
      : [];
    const productsToUpdateIds = new Set<string>(ownRows.map((row) => row.id));

    // Las variantes hermanas se resuelven aquí, no en la vista del navegador:
    // el diálogo pide este conteo antes de aplicar (`preview`).
    let siblings = { total: 0, archived: 0 };
    if (productGroupIds && productGroupIds.length > 0) {
      const groupProducts = await prismadb.product.findMany({
        where: {
          storeId: params.storeId,
          productGroupId: { in: productGroupIds },
        },
        select: { id: true, isArchived: true },
      });
      const extra = groupProducts.filter((p) => !productsToUpdateIds.has(p.id));
      siblings = {
        total: extra.length,
        archived: extra.filter((p) => p.isArchived).length,
      };
      groupProducts.forEach((p) => productsToUpdateIds.add(p.id));
    }

    const finalProductIds = Array.from(productsToUpdateIds);

    if (isRelation && !preview) {
      // El valor debe ser de esta tienda; sin claves foráneas nada lo impedía.
      const table = {
        categoryId: prismadb.category,
        colorId: prismadb.color,
        sizeId: prismadb.size,
        designId: prismadb.design,
      }[field as (typeof RELATION_FIELDS)[number]];
      const owned = await (table as typeof prismadb.category).findFirst({
        where: { id: value, storeId: params.storeId },
        select: { id: true },
      });
      if (!owned)
        throw ErrorFactory.InvalidRequest("Ese valor no existe en esta tienda");
    }

    if (preview) {
      return NextResponse.json(
        { affected: finalProductIds.length, siblings },
        { headers: corsHeaders },
      );
    }

    if (finalProductIds.length === 0) {
      return NextResponse.json(
        {
          updated: 0,
          pausedListings: 0,
          message: "No hay productos para actualizar",
        },
        { headers: corsHeaders },
      );
    }

    const pausedListings = await prismadb.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: {
          storeId: params.storeId,
          id: { in: finalProductIds },
        },
        data: {
          [field]: isDate ? dateValue : value,
          // «No tiene identificador global» excluye GTIN y MPN, igual que en la ficha.
          ...(field === "hasNoProductIdentifier" && value === true
            ? { gtin: null, mpn: null }
            : {}),
        },
      });
      if (field === "isArchived" && value === true) {
        return pauseMarketplaceListingsForProducts(tx, finalProductIds);
      }
      return 0;
    });

    // Tienda (ISR), Redis y cola de Mercado Libre, también al cambiar
    // subcategoría o atributos: antes esos cambios dejaban la tienda rancia.
    await invalidateStoreProductsCache(params.storeId);

    const count = finalProductIds.length;
    return NextResponse.json(
      {
        updated: count,
        pausedListings,
        message: `Se ${count === 1 ? "actualizó" : "actualizaron"} ${count} ${count === 1 ? "producto" : "productos"}${pausedListings ? `; ${pausedListings} ${pausedListings === 1 ? "publicación de Mercado Libre se pausa" : "publicaciones de Mercado Libre se pausan"}` : ""}.`,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_BULK_UPDATE", {
      headers: corsHeaders,
    });
  }
}
