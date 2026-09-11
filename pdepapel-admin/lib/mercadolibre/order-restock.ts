import {
  MarketplaceInventoryStatus,
  MarketplaceOrderStatus,
  MarketplaceProvider,
} from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import {
  createInventoryMovementBatchResilient,
  explodeSaleLines,
  type CreateInventoryMovementParams,
} from "@/lib/inventory";
import {
  formatMarketplaceIssueReference,
  recordInventoryIssues,
} from "@/lib/order-inventory-issues";
import prismadb from "@/lib/prismadb";

import {
  enqueuePendingMarketplaceOutboxEvents,
  queueMarketplaceStockSyncEvents,
} from "./outbox";
import { isReturnMarketplaceOrderStatus } from "./order-status";

/**
 * Cierra el ciclo «venta cancelada → retorno físico confirmado». La
 * cancelación deja la venta en RESTOCK_PENDING a propósito (nunca se devuelve
 * stock sin ver la mercancía); esta acción es la confirmación humana: devuelve
 * cada unidad física (los kits ya vienen explotados en componentes) por el
 * helper del kardex, deja la venta en RESTOCKED y, si alguna línea no pudo
 * entrar, la registra como incidencia en Movimientos en vez de bloquear.
 */
export async function confirmMercadoLibreOrderReturn({
  storeId,
  externalOrderId,
  userId,
}: {
  storeId: string;
  externalOrderId: string;
  userId: string;
}) {
  const connection = await prismadb.marketplaceConnection.findUnique({
    where: {
      storeId_provider: { storeId, provider: MarketplaceProvider.MERCADOLIBRE },
    },
    select: { id: true },
  });
  if (!connection) {
    throw ErrorFactory.InvalidRequest(
      "Conecta una cuenta de Mercado Libre primero",
    );
  }

  const order = await prismadb.marketplaceOrder.findUnique({
    where: {
      connectionId_externalOrderId: {
        connectionId: connection.id,
        externalOrderId,
      },
    },
    select: {
      id: true,
      status: true,
      inventoryStatus: true,
      items: { select: { productId: true, quantity: true, title: true } },
    },
  });
  if (!order) throw ErrorFactory.NotFound("La venta de Mercado Libre no existe");
  if (order.inventoryStatus === MarketplaceInventoryStatus.RESTOCKED) {
    return { marketplaceOrderId: order.id, returned: 0, issues: 0, alreadyRestocked: true };
  }
  if (order.inventoryStatus !== MarketplaceInventoryStatus.RESTOCK_PENDING) {
    throw ErrorFactory.Conflict(
      "Solo se confirma el retorno de una venta cancelada cuyo inventario ya se había descontado",
    );
  }
  if (!isReturnMarketplaceOrderStatus(order.status)) {
    throw ErrorFactory.Conflict(
      "La venta ya no figura como cancelada ni reembolsada en Mercado Libre; re-sincronízala antes de devolver unidades",
    );
  }
  const unlinked = order.items.filter((item) => !item.productId);
  if (unlinked.length > 0) {
    throw ErrorFactory.Conflict(
      `Hay productos sin relación local (${unlinked.map((item) => item.title).join(", ")}); re-sincroniza la venta antes de confirmar el retorno`,
    );
  }

  return prismadb.$transaction(async (tx) => {
    const claim = await tx.marketplaceOrder.updateMany({
      where: {
        id: order.id,
        inventoryStatus: MarketplaceInventoryStatus.RESTOCK_PENDING,
      },
      data: {
        inventoryStatus: MarketplaceInventoryStatus.RESTOCKED,
        inventoryRestockedAt: new Date(),
        inventoryError: null,
      },
    });
    if (claim.count === 0) {
      throw ErrorFactory.Conflict(
        "Otra persona ya confirmó el retorno de esta venta",
      );
    }

    const physicalLines = await explodeSaleLines(
      tx,
      order.items.map((item) => ({
        productId: item.productId!,
        quantity: item.quantity,
      })),
    );
    const movements: CreateInventoryMovementParams[] = physicalLines.map(
      (line) => ({
        productId: line.physicalProductId,
        storeId,
        type: "ORDER_CANCELLED",
        quantity: line.physicalQuantity,
        reason: line.kitName
          ? `Mercado Libre: retorno físico confirmado ${externalOrderId} (Kit: ${line.kitName})`
          : `Mercado Libre: retorno físico confirmado ${externalOrderId}`,
        referenceId: order.id,
        createdBy: `USER_${userId}`,
      }),
    );
    const result = await createInventoryMovementBatchResilient(tx, movements);
    const issues = await recordInventoryIssues(tx, {
      storeId,
      orderId: null,
      orderNumber: formatMarketplaceIssueReference(externalOrderId),
      kind: "RESTOCK",
      failed: result.failed,
    });

    const productIds = Array.from(
      new Set([
        ...order.items.map((item) => item.productId!),
        ...physicalLines.map((line) => line.physicalProductId),
      ]),
    );
    await queueMarketplaceStockSyncEvents(tx, productIds);

    return {
      marketplaceOrderId: order.id,
      returned: result.success.reduce((total, line) => total + line.quantity, 0),
      issues,
      alreadyRestocked: false,
    };
  }).then(async (summary) => {
    try {
      await enqueuePendingMarketplaceOutboxEvents(connection.id);
    } catch (error) {
      console.error("Mercado Libre restock stock-sync dispatch deferred", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
    return summary;
  });
}
