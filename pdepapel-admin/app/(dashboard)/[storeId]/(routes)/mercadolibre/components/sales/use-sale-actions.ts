"use client";

import { useCallback, useState } from "react";

import { useActionConfirmation } from "@/hooks/use-action-confirmation";

import { getResponseError, type MarketplaceSale, type SaleFeedback } from "./sale-types";

/**
 * Las dos acciones que una fila puede pedir: volver a leer la venta en
 * Mercado Libre (excepción de inventario) y confirmar que la mercancía de una
 * venta cancelada o reembolsada volvió. Ambas confirman antes y avisan después.
 */
export function useSaleActions({
  storeId,
  onDone,
}: {
  storeId: string;
  onDone: (feedback: SaleFeedback) => Promise<void> | void;
}) {
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [busySaleId, setBusySaleId] = useState<string | null>(null);

  const resync = useCallback(
    async (sale: MarketplaceSale) => {
      if (
        !(await requestConfirmation({
          title: "¿Re-sincronizar venta?",
          description: `Se volverá a leer la venta ${sale.externalOrderId} en Mercado Libre para relacionarla con tus productos y aplicar el inventario pendiente. Si ya se descontó, no se descuenta dos veces.`,
          confirmLabel: "Re-sincronizar venta",
        }))
      ) {
        return;
      }
      setBusySaleId(sale.id);
      try {
        const response = await fetch(
          `/api/${storeId}/marketplaces/mercadolibre/orders/${sale.externalOrderId}/resync`,
          { method: "POST" },
        );
        if (!response.ok) throw new Error(await getResponseError(response));
        const result = (await response.json()) as {
          inventoryChanged: boolean;
          inventoryError: string | null;
          unlinkedItems: { title: string; sku: string | null }[];
        };
        if (result.unlinkedItems.length > 0) {
          await onDone({
            type: "error",
            message: `La venta ${sale.externalOrderId} sigue sin producto vinculado: ${result.unlinkedItems
              .map((item) => item.sku ?? item.title)
              .join(", ")}. Importa o vincula la publicación y vuelve a intentarlo.`,
          });
        } else if (result.inventoryError) {
          await onDone({ type: "error", message: result.inventoryError });
        } else {
          await onDone({
            type: "success",
            message: result.inventoryChanged
              ? `Venta ${sale.externalOrderId} re-sincronizada: el inventario quedó descontado.`
              : `Venta ${sale.externalOrderId} re-sincronizada sin cambios de inventario.`,
          });
        }
      } catch (error) {
        await onDone({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "No fue posible re-sincronizar la venta",
        });
      } finally {
        setBusySaleId(null);
      }
    },
    [onDone, requestConfirmation, storeId],
  );

  const confirmReturn = useCallback(
    async (sale: MarketplaceSale) => {
      const units = sale.items.reduce((total, item) => total + item.quantity, 0);
      const why = sale.status === "REFUNDED" ? "reembolsada" : "cancelada";
      if (
        !(await requestConfirmation({
          title: "¿Confirmar el retorno físico?",
          description: `Las ${units} unidades de la venta ${why} ${sale.externalOrderId} vuelven al inventario de la tienda en línea (los kits devuelven sus componentes) y se actualiza la publicación en Mercado Libre. Hazlo solo con la mercancía en la mano. No se puede deshacer.`,
          confirmLabel: "Sí, devolver al inventario",
        }))
      ) {
        return;
      }
      setBusySaleId(sale.id);
      try {
        const response = await fetch(
          `/api/${storeId}/marketplaces/mercadolibre/orders/${sale.externalOrderId}/restock`,
          { method: "POST" },
        );
        if (!response.ok) throw new Error(await getResponseError(response));
        const result = (await response.json()) as {
          returned: number;
          issues: number;
          alreadyRestocked: boolean;
        };
        await onDone({
          type: result.issues > 0 ? "error" : "success",
          message: result.alreadyRestocked
            ? `La venta ${sale.externalOrderId} ya había devuelto su inventario.`
            : result.issues > 0
              ? `${result.returned} unidades volvieron al inventario; ${result.issues} líneas no pudieron entrar y quedaron como incidencias en Movimientos de inventario.`
              : `${result.returned} unidades de la venta ${sale.externalOrderId} volvieron al inventario.`,
        });
      } catch (error) {
        await onDone({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "No fue posible confirmar el retorno",
        });
      } finally {
        setBusySaleId(null);
      }
    },
    [onDone, requestConfirmation, storeId],
  );

  return { resync, confirmReturn, busySaleId, confirmationDialog };
}
