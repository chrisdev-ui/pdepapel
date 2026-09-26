"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { getFairStockAvailability } from "@/lib/fair-phases";

import { KitRowDetail } from "./kit-row-detail";

export interface ReservedItemRow {
  id: string;
  allocatedQuantity: number;
  soldQuantity: number;
  packedQuantity?: number;
  returnedQuantity: number;
  damagedQuantity: number;
  lostQuantity: number;
  product: { name: string; sku: string };
  /** Piezas de un kit reservado; vacío o ausente en un producto suelto. */
  kitComponents?: { name: string; quantityPerKit: number }[];
}

/** A partir de cuántas filas aparece la casilla de búsqueda. */
export const RESERVED_ITEMS_FILTER_THRESHOLD = 20;

interface ReservedItemsTableProps {
  items: ReservedItemRow[];
  /**
   * Feria cerrada: en vez de lo disponible se muestra cómo quedó contada
   * cada fila (devuelto, dañado, perdido).
   */
  closed?: boolean;
}

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lo reservado para la feria, fila por fila y solo lectura. Es la misma tabla
 * en preparación (para revisar lo que ya salió de bodega), abierta (para saber
 * qué queda en la mesa) y cerrada (cómo quedó contada). Antes solo existía
 * al cerrar; en las otras dos fases lo único que quedaba era un total.
 */
export function ReservedItemsTable({
  items,
  closed = false,
}: ReservedItemsTableProps) {
  const [query, setQuery] = useState("");
  const filterable = items.length > RESERVED_ITEMS_FILTER_THRESHOLD;

  const rows = useMemo(() => {
    const sorted = [...items].sort((a, b) =>
      a.product.name.localeCompare(b.product.name, "es"),
    );
    const needle = normalize(query.trim());
    if (!filterable || !needle) return sorted;
    return sorted.filter(
      (item) =>
        normalize(item.product.name).includes(needle) ||
        normalize(item.product.sku).includes(needle),
    );
  }, [items, query, filterable]);

  const totalUnits = items.reduce(
    (total, item) => total + item.allocatedQuantity,
    0,
  );
  const availability = (item: ReservedItemRow) =>
    getFairStockAvailability({
      ...item,
      packedQuantity: item.packedQuantity ?? 0,
    });

  const columns = closed
    ? ["Reservado", "Vendido", "Devuelto", "Dañado", "Perdido"]
    : ["Reservadas", "Vendidas", "En cápsulas", "Disponibles"];
  const values = (item: ReservedItemRow) =>
    closed
      ? [
          item.allocatedQuantity,
          item.soldQuantity,
          item.returnedQuantity,
          item.damagedQuantity,
          item.lostQuantity,
        ]
      : [
          item.allocatedQuantity,
          item.soldQuantity,
          item.packedQuantity ?? 0,
          availability(item),
        ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "producto" : "productos"} ·{" "}
          {totalUnits}{" "}
          {totalUnits === 1 ? "unidad reservada" : "unidades reservadas"}
        </p>
        {filterable && (
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre o SKU"
            aria-label="Buscar en el inventario reservado"
            className="sm:w-64"
          />
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Ningún producto reservado coincide con «{query.trim()}».
        </p>
      ) : (
        <>
          {/* Tabla desde 640 px. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Producto</th>
                  {columns.map((column) => (
                    <th
                      key={column}
                      className="px-2 py-2 text-right font-medium"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-2 py-2">
                      <span className="font-medium">{item.product.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        SKU {item.product.sku}
                      </span>
                      <KitRowDetail
                        components={item.kitComponents}
                        className="mt-1"
                      />
                    </td>
                    {values(item).map((value, index) => (
                      <td
                        key={columns[index]}
                        className={`px-2 py-2 text-right tabular-nums ${
                          !closed && index === columns.length - 1
                            ? "font-semibold"
                            : ""
                        }`}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas en teléfono: una por producto, con las cifras rotuladas. */}
          <ul
            className="flex flex-col gap-2 sm:hidden"
            aria-label="Inventario reservado"
          >
            {rows.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                <p className="font-medium">{item.product.name}</p>
                <p className="text-xs text-muted-foreground">
                  SKU {item.product.sku}
                </p>
                <KitRowDetail
                  components={item.kitComponents}
                  className="mt-1"
                />
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {values(item).map((value, index) => (
                    <div
                      key={columns[index]}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <dt className="text-xs text-muted-foreground">
                        {columns[index]}
                      </dt>
                      <dd
                        className={`tabular-nums ${
                          !closed && index === columns.length - 1
                            ? "font-semibold"
                            : ""
                        }`}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
