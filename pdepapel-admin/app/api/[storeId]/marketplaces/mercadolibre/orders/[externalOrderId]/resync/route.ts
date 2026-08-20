import { auth } from "@clerk/nextjs";
import {
  MarketplaceConnectionStatus,
  MarketplaceInventoryStatus,
  MarketplaceProvider,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreResource } from "@/lib/mercadolibre/client";
import { synchronizeMercadoLibreOrder } from "@/lib/mercadolibre/order-sync";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const EXTERNAL_ORDER_ID_PATTERN = /^\d{8,30}$/;

/**
 * Re-reads a Mercado Libre sale and rebuilds its local links.
 *
 * A sale that arrived before its publication was imported keeps `listingId` and
 * `productId` NULL forever, because those are resolved once at synchronization
 * time. That leaves the sale without acquisition cost in the profitability report
 * and with its inventory never applied. Re-synchronizing resolves the items again
 * against today's publications.
 */
export async function POST(
  _request: Request,
  { params }: { params: { storeId: string; externalOrderId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const externalOrderId = params.externalOrderId?.trim() ?? "";
    if (!EXTERNAL_ORDER_ID_PATTERN.test(externalOrderId)) {
      throw ErrorFactory.InvalidRequest(
        "El número de venta de Mercado Libre no es válido",
      );
    }

    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: { id: true, status: true },
    });
    if (
      !connection ||
      connection.status !== MarketplaceConnectionStatus.CONNECTED
    ) {
      throw ErrorFactory.InvalidRequest(
        "Conecta una cuenta activa de Mercado Libre primero",
      );
    }

    const existingOrder = await prismadb.marketplaceOrder.findUnique({
      where: {
        connectionId_externalOrderId: {
          connectionId: connection.id,
          externalOrderId,
        },
      },
      select: { id: true, inventoryStatus: true },
    });
    if (!existingOrder) {
      throw ErrorFactory.InvalidRequest(
        "Esa venta todavía no existe en P de Papel; impórtala antes de re-sincronizarla",
      );
    }

    try {
      // An EXCEPTION means the inventory was never applied (the transaction that
      // claims the order rolls back on failure), so it is safe to release the
      // order for a fresh attempt. DECREMENTED and RESTOCK_PENDING are left alone
      // so units are never discounted twice.
      if (
        existingOrder.inventoryStatus === MarketplaceInventoryStatus.EXCEPTION
      ) {
        await prismadb.marketplaceOrder.updateMany({
          where: {
            id: existingOrder.id,
            inventoryStatus: MarketplaceInventoryStatus.EXCEPTION,
          },
          data: {
            inventoryStatus: MarketplaceInventoryStatus.NOT_APPLIED,
            inventoryError: null,
          },
        });
      }

      const payload = await getMercadoLibreResource(
        connection.id,
        `/orders/${externalOrderId}`,
      );
      const result = await synchronizeMercadoLibreOrder(
        connection.id,
        params.storeId,
        payload,
      );

      const refreshedOrder = await prismadb.marketplaceOrder.findUnique({
        where: { id: existingOrder.id },
        select: {
          inventoryStatus: true,
          inventoryError: true,
          items: {
            select: { title: true, sku: true, productId: true },
          },
        },
      });
      const items = refreshedOrder?.items ?? [];
      const unlinkedItems = items.filter((item) => !item.productId);

      return NextResponse.json(
        {
          externalOrderId,
          inventoryChanged: result.inventoryChanged,
          needsAttention: result.needsAttention,
          inventoryStatus: refreshedOrder?.inventoryStatus ?? null,
          inventoryError: refreshedOrder?.inventoryError ?? null,
          linkedItems: items.length - unlinkedItems.length,
          totalItems: items.length,
          unlinkedItems: unlinkedItems.map((item) => ({
            title: item.title,
            sku: item.sku,
          })),
        },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    } catch (error) {
      throw ErrorFactory.InvalidRequest(
        error instanceof Error
          ? error.message
          : "No fue posible re-sincronizar la venta de Mercado Libre",
      );
    }
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_ORDER_RESYNC_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
