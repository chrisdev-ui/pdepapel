import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import {
  OPEN_RESTOCK_STATUSES,
  duplicateSupplierMessage,
  findDuplicateSupplierName,
  isUniqueConstraintError,
  parseSupplierInput,
  supplierDeleteBlockedMessage,
} from "@/lib/suppliers";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** Un proveedor con su uso: conteos, últimos pedidos y pedidos abiertos. */

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; supplierId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.supplierId) {
      throw ErrorFactory.InvalidRequest("El ID del proveedor es requerido");
    }
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const [supplier, openRestockOrders] = await Promise.all([
      prismadb.supplier.findFirst({
        where: { id: params.supplierId, storeId: params.storeId },
        include: {
          _count: { select: { products: true, restockOrders: true } },
          restockOrders: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              createdAt: true,
              totalAmount: true,
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      }),
      prismadb.restockOrder.count({
        where: {
          storeId: params.storeId,
          supplierId: params.supplierId,
          status: { in: OPEN_RESTOCK_STATUSES },
        },
      }),
    ]);

    if (!supplier) {
      throw ErrorFactory.NotFound("El proveedor no existe en esta tienda");
    }

    const { restockOrders, ...rest } = supplier;

    return NextResponse.json(
      { ...rest, recentRestockOrders: restockOrders, openRestockOrders },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIER_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; supplierId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.supplierId) {
      throw ErrorFactory.InvalidRequest("El ID del proveedor es requerido");
    }

    const body = await req.json();
    await verifyStoreOwner(userId, params.storeId);

    const input = parseSupplierInput(body);

    const candidates = await prismadb.supplier.findMany({
      where: { storeId: params.storeId },
      select: { id: true, name: true },
    });
    if (!candidates.some((candidate) => candidate.id === params.supplierId)) {
      throw ErrorFactory.NotFound("El proveedor no existe en esta tienda");
    }
    if (findDuplicateSupplierName(candidates, input.name, params.supplierId)) {
      throw ErrorFactory.Conflict(duplicateSupplierMessage(input.name));
    }

    let updated;
    try {
      updated = await prismadb.supplier.update({
        where: { id: params.supplierId, storeId: params.storeId },
        data: input,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw ErrorFactory.Conflict(duplicateSupplierMessage(input.name));
      }
      throw error;
    }

    return NextResponse.json(updated, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIER_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404, 409],
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; supplierId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.supplierId) {
      throw ErrorFactory.InvalidRequest("El ID del proveedor es requerido");
    }

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: params.supplierId, storeId: params.storeId },
        select: {
          id: true,
          name: true,
          _count: { select: { products: true, restockOrders: true } },
        },
      });

      if (!supplier) {
        throw ErrorFactory.NotFound("El proveedor no existe en esta tienda");
      }

      if (supplier._count.products > 0 || supplier._count.restockOrders > 0) {
        // Los pedidos de aprovisionamiento son el historial de compras
        // (y la base para las compras tributarias): nunca se borran en cascada.
        throw ErrorFactory.Conflict(supplierDeleteBlockedMessage(supplier._count), {
          supplier: supplier.name,
          products: supplier._count.products,
          restockOrders: supplier._count.restockOrders,
        });
      }

      await tx.supplier.delete({ where: { id: supplier.id } });
    });

    return NextResponse.json("Proveedor eliminado correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIER_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404, 409],
    });
  }
}
