import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import {
  duplicateSupplierMessage,
  findDuplicateSupplierName,
  isUniqueConstraintError,
  parseSupplierInput,
  supplierDeleteBlockedMessage,
} from "@/lib/suppliers";
import {
  CACHE_HEADERS,
  parseErrorDetails,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Proveedores de la tienda. Solo la dueña: nombres, NIT, contactos y
 * conteos de compras son información del negocio, así que nada se cachea.
 */

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const body = await req.json();
    await verifyStoreOwner(userId, params.storeId);

    const input = parseSupplierInput(body);

    // MySQL con Prisma no acepta `mode: "insensitive"`: se filtra grueso por
    // tienda y se compara en minúsculas en código antes de tocar el índice.
    const candidates = await prismadb.supplier.findMany({
      where: { storeId: params.storeId },
      select: { id: true, name: true },
    });
    if (findDuplicateSupplierName(candidates, input.name)) {
      throw ErrorFactory.Conflict(duplicateSupplierMessage(input.name));
    }

    let supplier;
    try {
      supplier = await prismadb.supplier.create({
        data: { ...input, storeId: params.storeId },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw ErrorFactory.Conflict(duplicateSupplierMessage(input.name));
      }
      throw error;
    }

    return NextResponse.json(supplier, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIERS_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 409],
    });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const suppliers = await prismadb.supplier.findMany({
      where: { storeId: params.storeId },
      include: {
        _count: { select: { products: true, restockOrders: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(suppliers, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIERS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Los IDs de los proveedores son requeridos y deben ser un array",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const suppliers = await tx.supplier.findMany({
        where: { storeId: params.storeId, id: { in: ids } },
        select: {
          id: true,
          name: true,
          _count: { select: { products: true, restockOrders: true } },
        },
      });

      if (suppliers.length !== ids.length) {
        throw ErrorFactory.InvalidRequest(
          "Algunos proveedores no existen o no pertenecen a esta tienda",
        );
      }

      const referenced = suppliers.filter(
        (supplier) =>
          supplier._count.products > 0 || supplier._count.restockOrders > 0,
      );

      if (referenced.length > 0) {
        const first = referenced[0];
        const prefix =
          referenced.length === 1
            ? `«${first.name}»: `
            : `${referenced.length} proveedores tienen productos o pedidos de aprovisionamiento. Por ejemplo «${first.name}»: `;
        throw ErrorFactory.Conflict(
          `${prefix}${supplierDeleteBlockedMessage(first._count)}`,
          parseErrorDetails(
            "suppliersWithReferences",
            referenced.map((supplier) => ({
              id: supplier.id,
              name: supplier.name,
              products: supplier._count.products,
              restockOrders: supplier._count.restockOrders,
            })),
          ),
        );
      }

      await tx.supplier.deleteMany({
        where: { storeId: params.storeId, id: { in: ids } },
      });
    });

    return NextResponse.json("Los proveedores han sido eliminados", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIERS_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 409],
    });
  }
}
