"use client";

import axios from "axios";
import { CalendarPlus, Loader2, MessageCircle, Package, Plus, Receipt, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ActionConfirmationDialog } from "@/components/modals/action-confirmation-dialog";
import { ReserveSheet } from "@/components/reservations/reserve-sheet";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Heading } from "@/components/ui/heading";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { expiryLabel } from "@/lib/reservation-labels";
import { cn } from "@/lib/utils";

export interface ReservationView {
  id: string;
  productId: string;
  quantity: number;
  customerName: string;
  customerPhone: string;
  note: string | null;
  expiresAt: string;
  status: "ACTIVE" | "CONVERTED" | "CONSUMED" | "RELEASED" | "EXPIRED";
  orderId: string | null;
  unbackedAt: string | null;
  createdAt: string;
  closedAt: string | null;
  product: { id: string; name: string; sku: string; isKit: boolean; stock: number; reservedUnits: number; images: { url: string }[] };
  order: { id: string; orderNumber: string; status: string } | null;
}

type Filter = "activas" | "convertidas" | "sin-respaldo" | "vencidas" | "cerradas";

const TABS: { value: Filter; label: string }[] = [
  { value: "activas", label: "Activas" },
  { value: "convertidas", label: "Con pedido sin pagar" },
  { value: "sin-respaldo", label: "Sin respaldo" },
  { value: "vencidas", label: "Vencidas" },
  { value: "cerradas", label: "Cerradas" },
];

const STATUS_CHIP: Record<ReservationView["status"], { label: string; tone: string }> = {
  ACTIVE: { label: "Reservado", tone: "sky" },
  CONVERTED: { label: "Con pedido", tone: "lavender" },
  CONSUMED: { label: "Vendido", tone: "mint" },
  RELEASED: { label: "Liberado", tone: "slate" },
  EXPIRED: { label: "Vencido", tone: "cream" },
};

const whatsappLink = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;

export function ReservationsClient({
  storeId,
  filter,
  reservations,
  defaultDays,
  counts,
}: {
  storeId: string;
  filter: Filter;
  reservations: ReservationView[];
  defaultDays: number;
  counts: { activas: number; convertidas: number; sinRespaldo: number };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [releasing, setReleasing] = useState<ReservationView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fail = (cause: unknown, fallback: string) => {
    const message = axios.isAxiosError(cause) ? cause.response?.data?.error : null;
    toast({ variant: "destructive", title: "No se pudo", description: typeof message === "string" ? message : fallback });
  };

  const release = async (hold: ReservationView) => {
    setBusyId(hold.id);
    try {
      await axios.patch(`/api/${storeId}/stock-reservations/${hold.id}`, { action: "liberar" });
      toast({ variant: "success", title: "Liberado", description: `${hold.quantity} × ${hold.product.name} vuelve a estar a la venta.` });
      router.refresh();
    } catch (cause) {
      fail(cause, "Intenta de nuevo.");
    } finally {
      setBusyId(null);
      setReleasing(null);
    }
  };

  const extend = async (hold: ReservationView, days: number) => {
    setBusyId(hold.id);
    try {
      await axios.patch(`/api/${storeId}/stock-reservations/${hold.id}`, { action: "extender", days });
      toast({ variant: "success", title: "Listo", description: `La reserva de ${hold.customerName} tiene ${days} ${days === 1 ? "día" : "días"} más.` });
      router.refresh();
    } catch (cause) {
      fail(cause, "Intenta de nuevo.");
    } finally {
      setBusyId(null);
    }
  };

  const convert = async (hold: ReservationView) => {
    setBusyId(hold.id);
    try {
      const { data } = await axios.post(`/api/${storeId}/stock-reservations/${hold.id}/convert`);
      toast({ variant: "success", title: "Pedido creado", description: "Completa el correo, la dirección y el pago en el pedido." });
      router.push(`/${storeId}/pedidos/${data.orderId}`);
    } catch (cause) {
      fail(cause, "Intenta de nuevo.");
      setBusyId(null);
    }
  };

  const tabCount = (value: Filter) =>
    value === "activas" ? counts.activas : value === "convertidas" ? counts.convertidas : value === "sin-respaldo" ? counts.sinRespaldo : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading title="Reservas" description="Unidades guardadas para clientas. No se venden hasta que las conviertas en pedido, las liberes o venzan." />
        <Button className="min-h-11" onClick={() => setSheetOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Reservar
        </Button>
      </div>

      <nav aria-label="Filtrar reservas" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map((tab) => {
          const count = tabCount(tab.value);
          return (
            <Link
              key={tab.value}
              href={`/${storeId}/reservas${tab.value === "activas" ? "" : `?filtro=${tab.value}`}`}
              aria-current={filter === tab.value ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm",
                filter === tab.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                tab.value === "sin-respaldo" && count ? "border-destructive/50" : null,
              )}
            >
              {tab.label}
              {count ? <span className="tabular-nums opacity-80">{count}</span> : null}
            </Link>
          );
        })}
      </nav>

      {reservations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Package className="h-6 w-6" aria-hidden="true" />
          {filter === "activas" ? "No hay reservas activas." : "No hay reservas aquí."}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {reservations.map((hold) => {
            const holding = hold.status === "ACTIVE" || hold.status === "CONVERTED";
            const overdue = holding && new Date(hold.expiresAt) < new Date();
            const chip = STATUS_CHIP[hold.status];
            return (
              <li key={hold.id} className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4", hold.unbackedAt && holding && "border-destructive/60")} data-testid="reservation-card">
                <div className="flex min-w-0 items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de Cloudinary, ya optimizada */}
                  {hold.product.images[0] ? <img src={hold.product.images[0].url} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" /> : <div className="h-14 w-14 shrink-0 rounded-md bg-muted" />}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={`/${storeId}/productos/${hold.productId}`} className="break-words text-sm font-semibold leading-tight hover:underline">
                      {hold.quantity} × {hold.product.name}
                    </Link>
                    <p className="text-sm">
                      {hold.customerName}
                      {hold.customerPhone ? (
                        <a href={whatsappLink(hold.customerPhone)} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline">
                          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          WhatsApp
                        </a>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TintBadge label={chip.label} tone={chip.tone} className="text-[11px]" />
                      {holding && <TintBadge label={expiryLabel(hold.expiresAt)} tone={overdue ? "pink" : "cream"} className="text-[11px]" />}
                      {hold.unbackedAt && holding && <TintBadge label="Sin respaldo" tone="pink" className="text-[11px]" />}
                      {hold.order && (
                        <Link href={`/${storeId}/pedidos/${hold.order.id}`} className="text-xs text-primary hover:underline">
                          Pedido {hold.order.orderNumber}
                        </Link>
                      )}
                    </div>
                    {hold.unbackedAt && holding && (
                      <p className="text-xs text-destructive">Una venta pagada se llevó estas unidades. Repón, ofrece otro producto o libera la reserva.</p>
                    )}
                    {hold.note && <p className="break-words text-xs text-muted-foreground">{hold.note}</p>}
                  </div>
                </div>

                {holding && (
                  <div className="grid grid-cols-3 gap-2">
                    {hold.status === "ACTIVE" ? (
                      <Button size="sm" className="min-h-10" disabled={busyId === hold.id} onClick={() => convert(hold)}>
                        {busyId === hold.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Receipt className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                        Convertir
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="min-h-10" asChild>
                        <Link href={`/${storeId}/pedidos/${hold.orderId}`}>
                          <Receipt className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          Pedido
                        </Link>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="min-h-10" disabled={busyId === hold.id} onClick={() => setReleasing(hold)}>
                      <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      Liberar
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="min-h-10" disabled={busyId === hold.id}>
                          <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          + días
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {[1, 3, 7].map((days) => (
                          <DropdownMenuItem key={days} className="min-h-10" onSelect={() => extend(hold, days)}>
                            {days === 1 ? "1 día más" : `${days} días más`}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ReserveSheet open={sheetOpen} onOpenChange={setSheetOpen} defaultDays={defaultDays} />
      <ActionConfirmationDialog
        isOpen={releasing !== null}
        onOpenChange={(open) => !open && setReleasing(null)}
        onConfirm={() => releasing && release(releasing)}
        title="¿Liberar esta reserva?"
        description={releasing ? `${releasing.quantity} × ${releasing.product.name} de ${releasing.customerName} vuelve a estar a la venta en la tienda, Mercado Libre y el punto de venta.${releasing.status === "CONVERTED" ? " El pedido sigue abierto: cancélalo si ya no va." : ""}` : ""}
        confirmLabel="Liberar"
        destructive
      />
    </div>
  );
}
