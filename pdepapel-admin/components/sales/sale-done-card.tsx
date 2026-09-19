"use client";

import axios from "axios";
import { CheckCircle2, ExternalLink, MessageCircle, RotateCcw, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import dynamic from "next/dynamic";

import type { InvoiceData } from "@/components/invoice/store-invoice-pdf";
import { PAYMENT_LABELS, type SellCompletedSale } from "@/components/sales/sell-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { undoTimeLeft } from "@/lib/sell-cart";
import { currencyFormatter } from "@/lib/utils";

// El PDF solo existe en el navegador (mismo patrón que la ficha del pedido): sin `ssr: false`
// el botón llega indefinido al primer render y tumba toda la pantalla de venta.
const InvoiceDownloadButton = dynamic(
  () => import("@/components/invoice/invoice-download-button").then((mod) => mod.InvoiceDownloadButton),
  {
    ssr: false,
    loading: () => (
      <Button type="button" variant="outline" disabled>
        Preparando PDF…
      </Button>
    ),
  },
);

interface SaleDoneCardProps {
  storeId: string;
  storeName?: string;
  sale: SellCompletedSale;
  onNewSale: () => void;
  /** Cambios de la venta (pagada por Bold, deshecha, cancelada): el panel los conserva. */
  onChange: (patch: Partial<SellCompletedSale>) => void;
  /** Cada cuánto se consulta el estado mientras el datáfono cobra. */
  pollMs?: number;
}

type SaleState = "pending" | "paid" | "cancelled" | "undone";

/** El estado vive en la venta (y sobrevive al refresco); la tarjeta solo lo lee. */
function stateOf(sale: SellCompletedSale): SaleState {
  if (sale.undone) return "undone";
  if (sale.cancelled) return "cancelled";
  if (sale.pending) return "pending";
  return "paid";
}

const METHOD_TITLE: Record<string, string> = { CASH: "Efectivo", BankTransfer: "Transferencia", Bold: "Datáfono Bold" };

function formatLeft(ms: number) {
  const minutes = Math.ceil(ms / 60000);
  return `${minutes} min`;
}

/** Mensaje para compartir por WhatsApp: resumen legible de la venta, sin datos personales. */
export function buildSaleShareMessage(sale: SellCompletedSale, storeName: string): string {
  const lines = sale.lines.map((line) => `• ${line.quantity} × ${line.name}${line.chips?.length ? ` (${line.chips.join(", ")})` : ""} · ${currencyFormatter(line.price * line.quantity)}`);
  return [`${storeName} · Comprobante de compra`, `Pedido ${sale.orderNumber}`, ...lines, `Total: ${currencyFormatter(sale.total)} · ${METHOD_TITLE[sale.paymentMethod] ?? sale.paymentMethod}`, "¡Gracias por tu compra!"].join("\n");
}

export function buildSaleInvoiceData(sale: SellCompletedSale, at: Date): InvoiceData {
  const subtotal = sale.lines.reduce((sum, line) => sum + (line.originalPrice ?? line.price) * line.quantity, 0);
  return {
    orderNumber: sale.orderNumber,
    createdAt: at,
    customerName: "Consumidor final",
    customerEmail: "",
    customerPhone: "",
    documentId: "",
    address: "",
    city: "",
    department: "",
    items: sale.lines.map((line) => ({ name: line.chips?.length ? `${line.name} (${line.chips.join(", ")})` : line.name, quantity: line.quantity, price: line.price, sku: line.detail?.replace(/^SKU\s+/, "").split(" · ")[0] })),
    subtotal,
    discount: Math.max(0, subtotal - sale.total),
    shipping: 0,
    total: sale.total,
    paymentMethod: METHOD_TITLE[sale.paymentMethod] ?? sale.paymentMethod,
  };
}

/**
 * Tarjeta de «Venta registrada»: reemplaza al aviso que desaparecía. Enlaza
 * al pedido, ofrece el recibo y compartirlo, deja deshacer durante 30 minutos
 * (el pedido se cancela y el inventario vuelve) y arranca la siguiente venta.
 * Con datáfono espera a Bold consultando el estado del pedido.
 */
export function SaleDoneCard({ storeId, storeName = "Papelería P de Papel", sale, onNewSale, onChange, pollMs = 5000 }: SaleDoneCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const state = stateOf(sale);
  const paidAt = state === "pending" ? null : new Date(sale.paidAt ?? sale.at);
  const [now, setNow] = useState(() => new Date());
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);

  // Reloj para la ventana de deshacer.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Datáfono: el pedido pasa a pagado cuando Bold confirma; la tarjeta lo revisa sola.
  useEffect(() => {
    if (state !== "pending" || !sale.orderId) return;
    let cancelled = false;
    const check = async () => {
      try {
        const response = await axios.get(`/api/${storeId}/orders/${sale.orderId}`);
        const status = response.data?.status as string | undefined;
        if (cancelled || !status) return;
        if (status === "PAID" || status === "SENT") {
          onChange({ pending: false, paidAt: response.data?.paidAt ?? new Date().toISOString() });
          router.refresh();
        } else if (status === "CANCELLED" || status === "REJECTED") {
          onChange({ pending: false, cancelled: true });
        }
      } catch {
        // Un fallo de red no cambia nada: se vuelve a intentar en el siguiente tic.
      }
    };
    void check();
    const timer = setInterval(() => void check(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state, sale.orderId, storeId, pollMs, router, onChange]);

  const left = state === "paid" ? undoTimeLeft(paidAt, now) : state === "pending" ? 1 : 0;
  const canUndo = Boolean(sale.orderId) && left > 0 && (state === "paid" || state === "pending");

  const undo = async () => {
    if (!sale.orderId) return;
    try {
      setUndoing(true);
      const response = await axios.post<{ message: string }>(`/api/${storeId}/point-of-sale/sales/${sale.orderId}/undo`);
      onChange({ undone: true });
      setUndoOpen(false);
      toast({ description: response.data.message, variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "No se pudo deshacer", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setUndoing(false);
    }
  };

  const shareHref = `https://wa.me/?text=${encodeURIComponent(buildSaleShareMessage(sale, storeName))}`;
  const orderHref = sale.orderId ? `/${storeId}/pedidos/${sale.orderId}` : `/${storeId}/pedidos`;

  const badge =
    state === "pending" ? (
      <TintBadge tone="sky" label="Esperando al datáfono" />
    ) : state === "paid" ? (
      <TintBadge tone="mint" label="Venta registrada" />
    ) : state === "undone" ? (
      <TintBadge tone="slate" label="Venta deshecha" />
    ) : (
      <TintBadge tone="pink" label="Cobro cancelado" />
    );

  return (
    <section
      aria-live="polite"
      data-testid="sale-done"
      data-state={state}
      className={
        state === "paid"
          ? "flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50 p-4"
          : state === "pending"
            ? "flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"
            : "flex flex-col gap-3 rounded-xl border bg-muted/40 p-4"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {state === "paid" ? <CheckCircle2 className="h-5 w-5 text-green-700" aria-hidden="true" /> : <ShoppingBag className="h-5 w-5 text-primary" aria-hidden="true" />}
        {badge}
        <Link href={orderHref} className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">
          {sale.orderNumber}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {currencyFormatter(sale.total)} en {PAYMENT_LABELS[sale.paymentMethod]} · {sale.units} unidad{sale.units === 1 ? "" : "es"}
        {sale.savings > 0 ? ` · ${currencyFormatter(sale.savings)} de rebaja por ofertas` : ""}
        {state === "pending"
          ? ". Pasa la tarjeta en el datáfono; esta tarjeta se actualiza sola cuando Bold confirme."
          : state === "paid"
            ? ". Inventario descontado y kardex escrito."
            : state === "undone"
              ? ". El pedido quedó cancelado y el inventario volvió."
              : ". Bold rechazó o canceló el cobro; no se descontó inventario."}
      </p>
      {sale.terminal && state === "pending" && <p className="text-xs text-muted-foreground">{sale.terminal}</p>}
      {/* Teléfono: dos columnas parejas; desde tableta, en fila. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
        {state === "paid" && <InvoiceDownloadButton data={buildSaleInvoiceData(sale, paidAt ?? sale.at)} />}
        {state === "paid" && (
          <Button asChild type="button" variant="outline">
            <a href={shareHref} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              WhatsApp
            </a>
          </Button>
        )}
        {canUndo && (
          <Button type="button" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setUndoOpen(true)}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            {state === "pending" ? "Cancelar cobro" : `Deshacer · ${formatLeft(left)}`}
          </Button>
        )}
        <Button type="button" onClick={onNewSale}>
          Nueva venta
        </Button>
      </div>
      {state === "paid" && left <= 0 && <p className="text-xs text-muted-foreground">Pasaron 30 minutos: una devolución se registra desde Movimientos de inventario.</p>}

      <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state === "pending" ? `¿Cancelar el cobro de ${sale.orderNumber}?` : `¿Deshacer la venta ${sale.orderNumber}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {state === "pending"
                ? "La venta pendiente queda cancelada. No descontó inventario, así que no hay nada que devolver."
                : `Devuelve ${sale.units} unidad${sale.units === 1 ? "" : "es"} al inventario con su movimiento de cancelación y deja el pedido cancelado en Pedidos. Si ya cobraste, devuelve el dinero tú.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoing}>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void undo(); }} disabled={undoing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {undoing ? "Deshaciendo…" : state === "pending" ? "Sí, cancelar cobro" : "Sí, deshacer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
