"use client";

import { ClipboardList } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { buildPickingList, type PickingSourceShipment } from "@/lib/shipment-views";

const PRINT_STYLES = `
  body { font-family: Inter, system-ui, sans-serif; color: #111; margin: 24px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 20px 0 8px; }
  p { margin: 0 0 12px; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; page-break-inside: avoid; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  td.num, th.num { text-align: right; width: 48px; }
  td.check { width: 22px; text-align: center; }
  .order { margin-bottom: 14px; page-break-inside: avoid; }
  .order header { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 4px; }
  .muted { color: #666; font-weight: 400; }
  @media print { body { margin: 12mm; } }
`;

const escape = (value: string | null | undefined) =>
  String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);

const DATE = new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeZone: "America/Bogota" });

export function printPickingList(shipments: PickingSourceShipment[]): boolean {
  const list = buildPickingList(shipments);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const totals = list.totals
    .map(
      (item) =>
        `<tr><td class="check">☐</td><td>${escape(item.name)}</td><td class="muted">${escape(item.sku)}</td><td class="num">${item.quantity}</td><td class="num">${item.orders}</td></tr>`,
    )
    .join("");
  const orders = list.orders
    .map(
      (order) => `<section class="order">
        <header><span>${escape(order.orderNumber)} <span class="muted">· ${escape(order.fullName)}${order.city ? ` · ${escape(order.city)}` : ""}</span></span><span class="muted">${escape(order.carrier ?? "Sin transportadora")}${order.trackingCode ? ` · ${escape(order.trackingCode)}` : ""}</span></header>
        <table><thead><tr><th class="check"></th><th>Producto</th><th>SKU</th><th class="num">Cant.</th></tr></thead><tbody>
        ${order.items.map((item) => `<tr><td class="check">☐</td><td>${escape(item.name)}</td><td class="muted">${escape(item.sku)}</td><td class="num">${item.quantity}</td></tr>`).join("")}
        </tbody></table>
      </section>`,
    )
    .join("");

  printWindow.document.write(`<!doctype html>
    <html lang="es"><head><meta charset="utf-8" /><title>Lista de recogida · P de Papel</title><style>${PRINT_STYLES}</style></head>
    <body>
      <h1>Lista de recogida</h1>
      <p>${escape(DATE.format(new Date()))} · ${list.orders.length} pedido${list.orders.length === 1 ? "" : "s"} · ${list.units} unidad${list.units === 1 ? "" : "es"}</p>
      <h2>Recoger del estante</h2>
      <table><thead><tr><th class="check"></th><th>Producto</th><th>SKU</th><th class="num">Total</th><th class="num">Pedidos</th></tr></thead><tbody>${totals}</tbody></table>
      <h2>Empacar por pedido</h2>
      ${orders}
    </body></html>`);
  printWindow.document.close();
  printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
  const start = () => {
    printWindow.focus();
    printWindow.print();
  };
  if (printWindow.document.readyState === "complete") window.setTimeout(start, 100);
  else printWindow.addEventListener("load", () => window.setTimeout(start, 100), { once: true });
  return true;
}

interface PickingListButtonProps {
  shipments: PickingSourceShipment[];
  /** Cuando se pasa, imprime solo estos envíos (selección de la tabla). */
  selectedIds?: string[];
  variant?: "default" | "outline" | "soft" | "ghost";
  size?: "default" | "sm";
}

export function PickingListButton({ shipments, selectedIds, variant = "default", size = "default" }: PickingListButtonProps) {
  const { toast } = useToast();
  const target = useMemo(
    () => (selectedIds ? shipments.filter((shipment) => selectedIds.includes(shipment.id)) : shipments),
    [shipments, selectedIds],
  );
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={target.length === 0}
      onClick={() => {
        if (!printPickingList(target)) {
          toast({
            title: "No se pudo abrir la impresión",
            description: "Permite las ventanas emergentes e inténtalo de nuevo.",
            variant: "destructive",
          });
        }
      }}
    >
      <ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" />
      Lista de recogida{target.length > 0 ? ` (${target.length})` : ""}
    </Button>
  );
}
