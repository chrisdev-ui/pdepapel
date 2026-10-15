"use client";

import axios from "axios";
import { CalendarPlus, Loader2, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AsyncProductSelect, type AsyncProductOption } from "@/components/ui/async-product-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { ProductScanButton } from "@/components/ui/product-scan-button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Textarea } from "@/components/ui/textarea";
import { UserCombobox } from "@/components/ui/user-combobox";
import { useToast } from "@/hooks/use-toast";
import { expiryLabel, reservableLine } from "@/lib/reservation-labels";
import { scanAccepted } from "@/lib/scan-outcome";
import { createIdempotencyKey } from "@/lib/sell-cart";
import { cn, currencyFormatter } from "@/lib/utils";

export interface ReserveSheetProduct {
  id: string;
  name: string;
  stock?: number;
  reservedUnits?: number;
  price?: number | null;
}

export interface ReserveSheetLine {
  product: ReserveSheetProduct;
  quantity: number;
}

/** Una reserva abierta a la que se pueden agregar productos. */
export interface ReserveSheetTarget {
  id: string;
  customerName: string;
  expiresAt: string;
  summary?: string;
}

export interface ReserveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Días por defecto (Configuración › Reservas). */
  defaultDays: number;
  /** Productos con los que abre la hoja (la ficha, el pedido de WhatsApp). */
  lines?: ReserveSheetLine[];
  /** Atajo de un solo producto. */
  product?: ReserveSheetProduct | null;
  quantity?: number;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  /** Desde el detalle: agregar a esta reserva en vez de crear otra. */
  target?: ReserveSheetTarget | null;
  /** La reserva creada o actualizada (fechas como texto) y las unidades que se acaban de guardar. */
  onSaved?: (reservation: SavedReservation, mode: "created" | "added", saved: { productId: string; quantity: number }[]) => void;
}

export type SavedReservation = { id: string; expiresAt: string; items: { productId: string; quantity: number }[] } & Record<string, unknown>;

type OpenReservation = { id: string; customerName: string; expiresAt: string; items: { quantity: number; product: { name: string } }[] };

const DAY_MS = 24 * 60 * 60 * 1000;
const availableOf = (product: ReserveSheetProduct) =>
  typeof product.stock === "number" ? Math.max(0, product.stock - (product.reservedUnits ?? 0)) : null;
const phoneDigits = (value: string) => value.replace(/\D/g, "");
const describeOpen = (row: OpenReservation) => {
  const units = row.items.reduce((sum, item) => sum + item.quantity, 0);
  return row.items.length === 1 ? `${row.items[0].quantity} × ${row.items[0].product.name}` : `${row.items.length} productos · ${units} unidades`;
};

function initialLines(props: ReserveSheetProps): ReserveSheetLine[] {
  if (props.lines?.length) return props.lines.map((line) => ({ product: { ...line.product }, quantity: Math.max(1, line.quantity) }));
  if (props.product) return [{ product: { ...props.product }, quantity: Math.max(1, props.quantity ?? 1) }];
  return [];
}

/**
 * «Reservar»: guarda unidades de uno o varios productos para una clienta del
 * grupo sin venderlas. Si esa clienta ya tiene una reserva abierta (por su
 * celular), lo normal es agregar a esa; «Crear otra» queda como alternativa.
 * Agregar nunca mueve el vencimiento: si vence en menos de 24 h se ofrece
 * «Extender», apagado hasta que Paula lo marque.
 */
export function ReserveSheet(props: ReserveSheetProps) {
  const { open, onOpenChange, defaultDays, onSaved, target } = props;
  const params = useParams<{ storeId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [lines, setLines] = useState<ReserveSheetLine[]>(() => initialLines(props));
  const [customerName, setCustomerName] = useState(props.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(props.customerPhone ?? "");
  const [customerKey, setCustomerKey] = useState("");
  const [days, setDays] = useState(String(defaultDays));
  const [note, setNote] = useState(props.note ?? "");
  const [openReservations, setOpenReservations] = useState<OpenReservation[]>([]);
  const [addToOpen, setAddToOpen] = useState(true);
  const [extend, setExtend] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey("reserve"));

  const presetSignature = JSON.stringify([props.lines?.map((line) => [line.product.id, line.quantity]), props.product?.id, props.quantity, props.customerName, props.customerPhone, props.note, target?.id]);
  useEffect(() => {
    if (!open) return;
    setLines(initialLines(props));
    setCustomerName(props.customerName ?? "");
    setCustomerPhone(props.customerPhone ?? "");
    setCustomerKey("");
    setDays(String(defaultDays));
    setNote(props.note ?? "");
    setOpenReservations([]);
    setAddToOpen(true);
    setExtend(false);
    setError(null);
    setIdempotencyKey(createIdempotencyKey("reserve"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se reinicia al abrir o si cambia lo que trae preparado
  }, [open, presetSignature, defaultDays]);

  // Las reservas abiertas de la clienta, por su celular: el nombre se repite.
  const digits = phoneDigits(customerPhone);
  useEffect(() => {
    if (!open || target || digits.length < 10) {
      setOpenReservations([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get(`/api/${params.storeId}/stock-reservations`, { params: { telefono: customerPhone } });
        if (!cancelled) setOpenReservations(Array.isArray(data?.reservations) ? data.reservations : []);
      } catch {
        if (!cancelled) setOpenReservations([]);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, target, digits, customerPhone, params.storeId]);

  const openReservation = openReservations[0] ?? null;
  const destination: ReserveSheetTarget | null =
    target ?? (openReservation && addToOpen ? { id: openReservation.id, customerName: openReservation.customerName, expiresAt: openReservation.expiresAt, summary: describeOpen(openReservation) } : null);
  const expiresSoon = destination ? new Date(destination.expiresAt).getTime() - Date.now() < DAY_MS : false;

  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const priced = lines.every((line) => typeof line.product.price === "number");
  const total = useMemo(() => lines.reduce((sum, line) => sum + (line.product.price ?? 0) * line.quantity, 0), [lines]);
  const blocked = lines.some((line) => availableOf(line.product) === 0);

  const addProduct = (option?: AsyncProductOption | null) => {
    if (!option) return;
    setError(null);
    setLines((current) => {
      const index = current.findIndex((line) => line.product.id === option.id);
      if (index >= 0) return current.map((line, at) => (at === index ? { ...line, quantity: line.quantity + 1 } : line));
      return [...current, { product: { id: option.id, name: option.name, stock: option.stock, reservedUnits: option.reservedUnits ?? 0, price: option.price ?? null }, quantity: 1 }];
    });
  };
  const setQuantity = (productId: string, quantity: number) =>
    setLines((current) => current.map((line) => (line.product.id === productId ? { ...line, quantity: Math.max(1, quantity) } : line)));
  const removeLine = (productId: string) => setLines((current) => current.filter((line) => line.product.id !== productId));

  const submit = async () => {
    if (submitting.current) return;
    if (lines.length === 0) return setError("Agrega al menos un producto.");
    if (!destination && customerName.trim().length < 2) return setError("Escribe el nombre de la clienta.");
    submitting.current = true;
    setSaving(true);
    setError(null);
    const items = lines.map((line) => ({ productId: line.product.id, quantity: line.quantity }));
    try {
      let reservation: SavedReservation;
      if (destination) {
        const { data } = await axios.patch(
          `/api/${params.storeId}/stock-reservations/${destination.id}`,
          { action: "add_items", items },
          { headers: { "Idempotency-Key": idempotencyKey } },
        );
        reservation = data.reservation;
        if (extend) {
          const extended = await axios.patch(`/api/${params.storeId}/stock-reservations/${destination.id}`, { action: "extender", days: Number(days) || defaultDays });
          reservation = extended.data.reservation;
        }
        toast({ variant: "success", title: "Agregado a la reserva", description: `${units === 1 ? "1 unidad" : `${units} unidades`} más para ${destination.customerName}.${extend ? " También se extendió el vencimiento." : ""}` });
      } else {
        const { data } = await axios.post(
          `/api/${params.storeId}/stock-reservations`,
          { items, customerName, customerPhone, days: Number(days), note },
          { headers: { "Idempotency-Key": idempotencyKey } },
        );
        reservation = data.reservation;
        toast({ variant: "success", title: "Reservado", description: `${units === 1 ? "1 unidad" : `${units} unidades`} para ${customerName.trim()}. Ya no se venden en la tienda ni en Mercado Libre.` });
      }
      onOpenChange(false);
      onSaved?.(reservation, destination ? "added" : "created", items);
      router.refresh();
    } catch (cause) {
      const message = axios.isAxiosError(cause) ? (cause.response?.data?.error ?? cause.response?.data?.message) : null;
      setError(typeof message === "string" ? message : "No se pudo reservar. Intenta de nuevo.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const saveLabel = destination ? `Agregar ${units === 1 ? "1 unidad" : `${units} unidades`}` : `Reservar ${units === 1 ? "1 unidad" : `${units} unidades`}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[94dvh] w-full max-w-none flex-col gap-0 rounded-t-2xl p-0 md:max-w-2xl lg:max-w-3xl"
      >
        <SheetHeader className="border-b px-4 pb-3 pt-5 text-left sm:px-6">
          <SheetTitle>{target ? "Agregar a la reserva" : "Reservar"}</SheetTitle>
          <SheetDescription>
            {target
              ? `Reserva de ${target.customerName}${target.summary ? ` · ${target.summary}` : ""}. El vencimiento no cambia.`
              : "Guarda unidades para una clienta. Dejan de venderse en la tienda, Mercado Libre y el punto de venta hasta que las conviertas en pedido o las liberes."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-6">
          <section className="flex flex-col gap-2" aria-label="Productos">
            <Label className="text-sm font-semibold">Productos</Label>
            {lines.length === 0 ? <p className="text-sm text-muted-foreground">Busca o escanea los productos que vas a reservar.</p> : null}
            <ul className="flex flex-col gap-2">
              {lines.map((line) => {
                const available = availableOf(line.product);
                return (
                  <li key={line.product.id} className="flex flex-col gap-2 rounded-lg border p-3" data-testid="reserve-line">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-medium">{line.product.name}</p>
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Quitar ${line.product.name}`} onClick={() => removeLine(line.product.id)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {available !== null ? (
                        <p className={cn("text-xs", available === 0 ? "font-medium text-destructive" : "text-muted-foreground")} data-testid="reserve-available">
                          {reservableLine(line.product.stock!, line.product.reservedUnits)}
                        </p>
                      ) : (
                        <span />
                      )}
                      <StockQuantityInput
                        value={line.quantity}
                        onChange={(value) => setQuantity(line.product.id, value)}
                        min={1}
                        max={available && available > 0 ? available : undefined}
                        ariaLabel={`Cantidad de ${line.product.name}`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-2">
              <AsyncProductSelect
                value=""
                onChange={(_value, option) => addProduct(option)}
                placeholder={lines.length ? "Agregar otro producto" : "Busca por nombre, SKU o código"}
                modal="auto"
                className="min-w-0 flex-1"
                ariaLabel="Agregar producto a la reserva"
              />
              <ProductScanButton compact label="Escanear producto" onFound={(option) => (addProduct(option), scanAccepted())} />
            </div>
          </section>

          {!target && (
            <section className="flex flex-col gap-3" aria-label="Clienta">
              <Label className="text-sm font-semibold">Clienta</Label>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Buscar una clienta que ya compró</span>
                <UserCombobox
                  options={[]}
                  value={customerKey}
                  onChange={(value, user) => {
                    setCustomerKey(value);
                    if (user) {
                      setCustomerName(user.label);
                      if (user.phone) setCustomerPhone(user.phone);
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reserve-name">Nombre</Label>
                  <Input id="reserve-name" autoComplete="off" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre como aparece en el grupo" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reserve-phone">Celular (WhatsApp)</Label>
                  <PhoneInput id="reserve-phone" value={customerPhone} onChange={(value) => setCustomerPhone(value ?? "")} placeholder="300 123 4567" />
                </div>
              </div>

              {openReservation && (
                <fieldset className="flex flex-col gap-2 rounded-lg border border-tint-sky bg-tint-sky/30 p-3" data-testid="open-reservation">
                  <legend className="px-1 text-sm font-medium">{openReservation.customerName} ya tiene una reserva abierta</legend>
                  <p className="text-xs text-muted-foreground">
                    {describeOpen(openReservation)} · {expiryLabel(openReservation.expiresAt)}
                  </p>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name="reserve-destination" className="h-4 w-4" checked={addToOpen} onChange={() => setAddToOpen(true)} />
                    Agregar a la reserva abierta
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name="reserve-destination" className="h-4 w-4" checked={!addToOpen} onChange={() => setAddToOpen(false)} />
                    Crear otra reserva
                  </label>
                </fieldset>
              )}
            </section>
          )}

          {destination && expiresSoon && (
            <div className="flex flex-col gap-2 rounded-lg border border-tint-pink bg-tint-pink/30 p-3" data-testid="extend-offer">
              <p className="text-sm font-medium">Esta reserva {expiryLabel(destination.expiresAt)}.</p>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={extend} onCheckedChange={(value) => setExtend(value === true)} aria-label="Extender la reserva al guardar" />
                <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                Extender {Number(days) || defaultDays} días al guardar
              </label>
            </div>
          )}

          {!destination && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reserve-days">Días</Label>
                <Input id="reserve-days" inputMode="numeric" type="number" min={1} max={60} value={days} onChange={(event) => setDays(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reserve-note">Nota (opcional)</Label>
                <Textarea id="reserve-note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej.: paga el viernes por transferencia" />
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm" data-testid="reserve-total">
            {lines.length === 0
              ? "Sin productos"
              : `${lines.length === 1 ? "1 producto" : `${lines.length} productos`} · ${units === 1 ? "1 unidad" : `${units} unidades`}${priced ? ` · ${currencyFormatter(total)} aprox.` : ""}`}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" className="min-h-11" onClick={submit} disabled={saving || lines.length === 0 || blocked}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {saveLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
