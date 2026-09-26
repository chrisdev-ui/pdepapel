"use client";

import axios from "axios";
import { useMemo } from "react";

import { type SellSource } from "@/components/sales/sell-panel";
import { Combobox } from "@/components/ui/combobox";
import { capsuleLine, productLine, toSaleItems } from "@/lib/sell-cart";
import { getFairStockAvailability } from "@/lib/fair-phases";

import type { FairInventoryItem, FairProduct } from "./fair-event-types";

interface UseFairSellSourceInput {
  storeId: string;
  fairEventId: string;
  /** Hay bucket de comprobantes configurado (lo decide el servidor). */
  paymentProofEnabled: boolean;
  availableItems: FairInventoryItem[];
  eventItemsByProduct: Map<string, FairInventoryItem>;
  addReservedProduct: (add: (line: any) => void, productId: string) => void;
}

/**
 * La feria vendiendo con el **mismo** panel que el Punto de venta: lo único
 * propio es de dónde salen los productos (solo lo reservado para esta feria),
 * que la cápsula entra como su propia línea, y a qué endpoint se cobra.
 *
 * Vive aparte porque era la mitad del tamaño del taller y no tiene nada que
 * ver con las otras fases.
 */
export function useFairSellSource({
  storeId,
  fairEventId,
  paymentProofEnabled,
  availableItems,
  eventItemsByProduct,
  addReservedProduct,
}: UseFairSellSourceInput): SellSource {
  return useMemo<SellSource>(
    () => ({
      lookup: async (code) => {
        const response = await axios.get(
          `/api/${storeId}/fair-events/${fairEventId}/lookup`,
          { params: { code } },
        );
        if (response.data.kind === "capsule") {
          return capsuleLine({
            code: String(response.data.code),
            productId: String(response.data.product.id),
            price: Number(response.data.salePrice),
            detail: `Contiene: ${response.data.product.name}`,
          });
        }
        const product = response.data.product as FairProduct;
        const eventItem = eventItemsByProduct.get(product.id);
        const available = eventItem ? getFairStockAvailability(eventItem) : 0;
        return productLine({
          productId: product.id,
          name: product.name,
          detail: `SKU ${product.sku} · ${available} reservadas`,
          price: Number(product.price),
          maxQuantity: available,
          imageUrl: product.images?.[0]?.url ?? null,
        });
      },
      submit: async ({ lines, paymentMethod, idempotencyKey, transactionId, proofKey }) => {
        const response = await axios.post(
          `/api/${storeId}/fair-events/${fairEventId}/sales`,
          {
            items: toSaleItems(lines),
            paymentMethod,
            idempotencyKey,
            transactionId,
            proofKey,
          },
        );
        return {
          orderNumber: response.data.order.orderNumber as string,
          duplicate: Boolean(response.data.duplicate),
        };
      },
      // Transferencia en la feria: referencia obligatoria (como en el Punto de
      // venta) y, si la clienta muestra la pantalla del banco, la foto del
      // comprobante. La subida va por el servidor a un bucket privado; sin
      // bucket configurado el campo no aparece.
      requireTransferReference: true,
      paymentProof: paymentProofEnabled
        ? {
            upload: async (file) => {
              const body = new FormData();
              body.append("file", file);
              const response = await axios.post(
                `/api/${storeId}/payment-proofs`,
                body,
              );
              return String(response.data.proofKey);
            },
            remove: async (proofKey) => {
              await axios.delete(`/api/${storeId}/payment-proofs`, {
                data: { proofKey },
              });
            },
          }
        : undefined,
      renderPicker: (add) => (
        <Combobox
          id="fair-product"
          aria-label="Producto reservado"
          value={null}
          onChange={(productId) => {
            if (productId) addReservedProduct(add, productId);
          }}
          options={availableItems.map((item) => ({
            value: item.productId,
            label: item.product.name,
            description: `${getFairStockAvailability(item)} reservadas · SKU ${item.product.sku}`,
            keywords: [item.product.sku, item.product.gtin ?? ""].filter(
              Boolean,
            ),
          }))}
          placeholder="Buscar producto reservado"
          searchPlaceholder="Nombre o SKU"
          emptyText="Ningún producto reservado coincide."
        />
      ),
      copy: {
        addDescription:
          "Escanea la etiqueta del producto o el QR de la cápsula. Solo se venden unidades reservadas para esta feria.",
        pickerLabel: "Producto reservado",
        scannerDescription:
          "Apunta la cámara a la etiqueta del producto o al QR de la cápsula.",
        confirmNote:
          "Cada venta queda como pedido pagado. Si falta reserva, no se registra ni descuenta parcialmente.",
        submitError:
          "No se cobró la venta; revisa el inventario de feria e intenta de nuevo.",
        saleNoun: "venta de feria",
      },
    }),
    [addReservedProduct, availableItems, fairEventId, eventItemsByProduct, paymentProofEnabled, storeId],
  );
}
