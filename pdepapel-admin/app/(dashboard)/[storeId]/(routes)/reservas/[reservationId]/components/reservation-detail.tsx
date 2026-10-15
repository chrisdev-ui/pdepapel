"use client";

import axios from "axios";
import { ArrowLeft, CalendarPlus, Loader2, MessageCircle, Pencil, Plus, Receipt, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ActionConfirmationDialog } from "@/components/modals/action-confirmation-dialog";
import { ConvertReservationDialog } from "@/components/reservations/convert-dialog";
import { ExpiryChip } from "@/components/reservations/expiry-chip";
import { ReserveSheet } from "@/components/reservations/reserve-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Textarea } from "@/components/ui/textarea";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { actorLabel, describeReservationEvent, type ReservationEventView } from "@/lib/reservation-history";
import { expiresWithinADay } from "@/lib/reservation-labels";

type ProductCard = { id: string; name: string; sku: string; isKit: boolean; stock: number; reservedUnits: number; images: { url: string }[] };
type Item = { id: string; productId: string; quantity: number; unbackedAt: string | null; product: ProductCard };

export interface ReservationDetailView {
  reservation: {
    id: string;
    productId: string | null;
    quantity: number | null;
    customerName: string;
    customerPhone: string;
    note: string | null;
    expiresAt: string;
    status: "ACTIVE" | "CONVERTED" | "CONSUMED" | "RELEASED" | "EXPIRED";
    orderId: string | null;
    unbackedAt: string | null;
    createdAt: string;
    closedAt: string | null;
    product: ProductCard | null;
    items: Item[];
    order: { id: string; orderNumber: string; status: string } | null;
  };
  events: ReservationEventView[];
  productNames: Record<string, string>;
}

const STATUS_CHIP: Record<ReservationDetailView["reservation"]["status"], { label: string; tone: string }> = {
  ACTIVE: { label: "Reservado", tone: "sky" },
  CONVERTED: { label: "Con pedido", tone: "lavender" },
  CONSUMED: { label: "Vendido", tone: "mint" },
  RELEASED: { label: "Liberado", tone: "slate" },
  EXPIRED: { label: "Vencido", tone: "cream" },
};

const whatsappLink = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
const when = (value: string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(value));

/**
 * El detalle de una reserva: sus productos (cambiar cantidad, quitar,
 * agregar), la clienta, el historial y las acciones. Una reserva convertida
 * se edita desde su pedido; una cerrada solo se lee.
 */
export function ReservationDetail({ storeId, detail, defaultDays }: { storeId: string; detail: ReservationDetailView; defaultDays: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const { reservation, events, productNames } = detail;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [removing, setRemoving] = useState<Item | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [extendDays, setExtendDays] = useState(String(defaultDays));
  const [customer, setCustomer] = useState({ customerName: reservation.customerName, customerPhone: reservation.customerPhone, note: reservation.note ?? "" });

  useEffect(() => {
    setQuantities({});
    setCustomer({ customerName: reservation.customerName, customerPhone: reservation.customerPhone, note: reservation.note ?? "" });
  }, [reservation]);

  const active = reservation.status === "ACTIVE";
  const holding = active || reservation.status === "CONVERTED";
  const expiringSoon = holding && expiresWithinADay(reservation.expiresAt);
  const items: Item[] =
    reservation.items.length > 0
      ? reservation.items
      : reservation.product
        ? [{ id: "header", productId: reservation.product.id, quantity: reservation.quantity ?? 0, unbackedAt: reservation.unbackedAt, product: reservation.product }]
        : [];
  const units = items.reduce((sum, item) => sum + item.quantity, 0);

  const run = async (key: string, work: () => Promise<void>, fallback: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(key);
    try {
      await work();
      router.refresh();
    } catch (cause) {
      const message = axios.isAxiosError(cause) ? cause.response?.data?.error : null;
      toast({ variant: "destructive", title: "No se pudo", description: typeof message === "string" ? message : fallback });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };
  const patch = (body: Record<string, unknown>) => axios.patch(`/api/${storeId}/stock-reservations/${reservation.id}`, body);

  const saveQuantity = (item: Item) =>
    run(`qty-${item.id}`, async () => {
      const { data } = await patch({ action: "set_quantity", itemId: item.id, quantity: quantities[item.id] });
      toast({ variant: "success", title: "Cantidad guardada", description: `${item.product.name}: ${quantities[item.id]}.` });
      if (data?.released) toast({ variant: "success", title: "Reserva liberada", description: "Ya no tenía productos." });
    }, "La cantidad no cambió. Intenta de nuevo.");

  const removeItem = (item: Item) =>
    run(`remove-${item.id}`, async () => {
      setRemoving(null);
      const { data } = await patch({ action: "set_quantity", itemId: item.id, quantity: 0 });
      toast({ variant: "success", title: "Producto quitado", description: data?.released ? "Era el último: la reserva se liberó." : `${item.product.name} vuelve a estar a la venta.` });
    }, "El producto sigue en la reserva. Intenta de nuevo.");

  const extend = () =>
    run("extend", async () => {
      const days = Number(extendDays) || defaultDays;
      await patch({ action: "extender", days });
      toast({ variant: "success", title: "Listo", description: `La reserva tiene ${days} ${days === 1 ? "día" : "días"} más.` });
    }, "La fecha no cambió. Intenta de nuevo.");

  const release = () =>
    run("release", async () => {
      setReleasing(false);
      await patch({ action: "liberar" });
      toast({ variant: "success", title: "Liberado", description: "Las unidades vuelven a estar a la venta." });
    }, "La reserva sigue activa. Intenta de nuevo.");

  const saveCustomer = () =>
    run("customer", async () => {
      await patch({ action: "edit_customer", ...customer });
      setEditingCustomer(false);
      toast({ variant: "success", title: "Datos guardados" });
    }, "Los datos no cambiaron. Intenta de nuevo.");

  const chip = STATUS_CHIP[reservation.status];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href={`/${storeId}/reservas`} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Reservas
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold leading-tight">Reserva de {reservation.customerName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length === 1 ? "1 producto" : `${items.length} productos`} · {units === 1 ? "1 unidad" : `${units} unidades`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <TintBadge label={chip.label} tone={chip.tone} className="text-[11px]" />
            {holding && <ExpiryChip expiresAt={reservation.expiresAt} />}
            {reservation.unbackedAt && holding && <TintBadge label="Sin respaldo" tone="pink" className="text-[11px]" />}
          </div>
        </div>
      </div>

      {expiringSoon && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-tint-pink/60 px-3 py-2" data-testid="extend-offer">
          <p className="text-sm font-medium">Vence en menos de 24 horas.</p>
          <Button type="button" size="sm" className="min-h-10" disabled={busy !== null} onClick={extend}>
            <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Extender {Number(extendDays) || defaultDays} {(Number(extendDays) || defaultDays) === 1 ? "día" : "días"}
          </Button>
        </div>
      )}

      {holding && (
        // En el flujo de la página, no fija abajo: en el teléfono la barra del panel la taparía.
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end" data-testid="reservation-actions">
          <Button type="button" variant="outline" className="min-h-11" disabled={busy !== null} onClick={() => setReleasing(true)}>
            <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Liberar
          </Button>
          {active && (
            <Button type="button" className="min-h-11" disabled={busy !== null} onClick={() => setConverting(true)}>
              <Receipt className="mr-2 h-4 w-4" aria-hidden="true" />
              Convertir en pedido
            </Button>
          )}
        </div>
      )}

      {reservation.status === "CONVERTED" && reservation.order && (
        <div className="rounded-lg border border-tint-lavender bg-tint-lavender/40 p-3 text-sm" data-testid="converted-note">
          Se edita desde el pedido{" "}
          <Link href={`/${storeId}/pedidos/${reservation.order.id}`} className="font-semibold text-primary underline-offset-2 hover:underline">
            {reservation.order.orderNumber}
          </Link>
          : al guardar sus productos, la reserva los sigue.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-label="Productos de la reserva">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Productos</h2>
              {active && (
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setAdding(true)}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Agregar productos
                </Button>
              )}
            </div>
            <ul className="flex flex-col divide-y">
              {items.map((item) => {
                const draft = quantities[item.id] ?? item.quantity;
                const changed = draft !== item.quantity;
                const available = Math.max(0, item.product.stock - item.product.reservedUnits);
                return (
                  <li key={item.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-testid="reservation-line">
                    <div className="flex min-w-0 items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de Cloudinary, ya optimizada */}
                      {item.product.images[0] ? <img src={item.product.images[0].url} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" /> : <div className="h-12 w-12 shrink-0 rounded-md bg-muted" />}
                      <div className="min-w-0 flex-1">
                        <Link href={`/${storeId}/productos/${item.productId}`} className="break-words text-sm font-medium hover:underline">
                          {item.product.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {active ? `Se pueden reservar ${available} más` : `${item.quantity} ${item.quantity === 1 ? "unidad" : "unidades"}`}
                          {item.unbackedAt ? " · sin respaldo" : ""}
                        </p>
                      </div>
                    </div>
                    {active && item.id !== "header" && (
                      <div className="flex items-center justify-end gap-2">
                        <StockQuantityInput
                          value={draft}
                          onChange={(value) => setQuantities((current) => ({ ...current, [item.id]: Math.max(1, value) }))}
                          min={1}
                          max={item.quantity + available}
                          ariaLabel={`Cantidad de ${item.product.name}`}
                          className="w-36 shrink-0"
                        />
                        {changed && (
                          <Button type="button" className="min-h-11" disabled={busy !== null} onClick={() => saveQuantity(item)}>
                            {busy === `qty-${item.id}` && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                            Guardar
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`Quitar ${item.product.name}`} disabled={busy !== null} onClick={() => setRemoving(item)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-label="Historial">
            <h2 className="text-base font-semibold">Historial</h2>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin cambios registrados todavía.</p>
            ) : (
              <ol className="flex flex-col gap-2" data-testid="reservation-history">
                {events.map((event) => (
                  <li key={event.id} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground sm:w-32">{when(event.createdAt)}</span>
                    <span className="min-w-0 break-words">
                      {describeReservationEvent(event, productNames)}
                      <span className="ml-1 text-xs text-muted-foreground">· {actorLabel(event.actor)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-label="Clienta">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Clienta</h2>
              {active && !editingCustomer && (
                <Button type="button" variant="ghost" className="min-h-11" onClick={() => setEditingCustomer(true)}>
                  <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                  Editar
                </Button>
              )}
            </div>
            {editingCustomer ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="detail-name">Nombre</Label>
                  <Input id="detail-name" value={customer.customerName} onChange={(event) => setCustomer((current) => ({ ...current, customerName: event.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="detail-phone">Celular (WhatsApp)</Label>
                  <PhoneInput id="detail-phone" value={customer.customerPhone} onChange={(value) => setCustomer((current) => ({ ...current, customerPhone: value ?? "" }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="detail-note">Nota</Label>
                  <Textarea id="detail-note" rows={2} maxLength={500} value={customer.note} onChange={(event) => setCustomer((current) => ({ ...current, note: event.target.value }))} />
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditingCustomer(false)} disabled={busy !== null}>
                    Cancelar
                  </Button>
                  <Button type="button" className="min-h-11" onClick={saveCustomer} disabled={busy !== null}>
                    Guardar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 text-sm">
                <p className="font-medium">{reservation.customerName}</p>
                {reservation.customerPhone ? (
                  <a href={whatsappLink(reservation.customerPhone)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-fit items-center gap-1 text-primary underline-offset-2 hover:underline">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    WhatsApp
                  </a>
                ) : (
                  <p className="text-muted-foreground">Sin celular</p>
                )}
                {reservation.note && <p className="break-words text-muted-foreground">{reservation.note}</p>}
              </div>
            )}
          </section>

          {holding && (
            <section className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-label="Vencimiento">
              <h2 className="text-base font-semibold">Vencimiento</h2>
              <p className="text-sm">
                <ExpiryChip expiresAt={reservation.expiresAt} />
              </p>

              <div className="flex items-end gap-2">
                <div className="flex w-24 flex-col gap-1.5">
                  <Label htmlFor="detail-extend">Días</Label>
                  <Input id="detail-extend" inputMode="numeric" type="number" min={1} max={60} value={extendDays} onChange={(event) => setExtendDays(event.target.value)} />
                </div>
                <Button type="button" variant={expiringSoon ? "default" : "outline"} className="min-h-11 flex-1" disabled={busy !== null} onClick={extend}>
                  {busy === "extend" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />}
                  Extender
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>

      <ReserveSheet
        open={adding}
        onOpenChange={setAdding}
        defaultDays={defaultDays}
        target={{ id: reservation.id, customerName: reservation.customerName, expiresAt: reservation.expiresAt, summary: `${items.length === 1 ? "1 producto" : `${items.length} productos`}` }}
      />
      <ConvertReservationDialog
        open={converting}
        onOpenChange={setConverting}
        storeId={storeId}
        reservationId={reservation.id}
        customerName={reservation.customerName}
        onConverted={(orderId) => {
          setConverting(false);
          toast({ variant: "success", title: "Pedido creado", description: "Completa el correo, la dirección y el pago en el pedido." });
          router.push(`/${storeId}/pedidos/${orderId}`);
        }}
      />
      <ActionConfirmationDialog
        isOpen={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        onConfirm={() => removing && removeItem(removing)}
        title={items.length === 1 ? "¿Quitar el último producto?" : "¿Quitar este producto?"}
        description={removing ? `${removing.quantity} × ${removing.product.name} vuelve a estar a la venta.${items.length === 1 ? " Era el último: la reserva se libera." : ""}` : ""}
        confirmLabel="Quitar"
        destructive
      />
      <ActionConfirmationDialog
        isOpen={releasing}
        onOpenChange={setReleasing}
        onConfirm={release}
        title="¿Liberar esta reserva?"
        description={`${items.length === 1 ? `${items[0]?.quantity ?? 0} × ${items[0]?.product.name ?? ""}` : `${items.length} productos`} de ${reservation.customerName} vuelve a estar a la venta en la tienda, Mercado Libre y el punto de venta.${reservation.status === "CONVERTED" ? " El pedido sigue abierto: cancélalo si ya no va." : ""}`}
        confirmLabel="Liberar"
        destructive
      />
    </div>
  );
}
