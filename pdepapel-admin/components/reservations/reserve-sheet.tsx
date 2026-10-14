"use client";

import axios from "axios";
import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AsyncProductSelect, type AsyncProductOption } from "@/components/ui/async-product-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { ProductScanButton } from "@/components/ui/product-scan-button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { reservableLine } from "@/lib/reservation-labels";
import { scanAccepted } from "@/lib/scan-outcome";
import { createIdempotencyKey } from "@/lib/sell-cart";

export interface ReserveSheetProduct {
  id: string;
  name: string;
  stock?: number;
  reservedUnits?: number;
}

export interface ReserveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Días por defecto (Configuración › Reservas). */
  defaultDays: number;
  product?: ReserveSheetProduct | null;
  quantity?: number;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  /** La reserva creada, tal como la devuelve la API (fechas como texto). */
  onCreated?: (reservation: CreatedReservation) => void;
}

export type CreatedReservation = { id: string; productId: string; quantity: number; expiresAt: string } & Record<string, unknown>;

const availableOf = (product?: ReserveSheetProduct | null) =>
  product && typeof product.stock === "number" ? Math.max(0, product.stock - (product.reservedUnits ?? 0)) : null;

/**
 * «Reservar»: guarda unidades para una clienta del grupo sin venderlas. Hoja
 * desde abajo, pensada para el celular: producto, cantidad, nombre, celular,
 * días y una nota. Las unidades dejan de estar a la venta en la tienda,
 * Mercado Libre y el punto de venta hasta que se conviertan en pedido, se
 * liberen o venzan.
 */
export function ReserveSheet(props: ReserveSheetProps) {
  const { open, onOpenChange, defaultDays, onCreated } = props;
  const params = useParams<{ storeId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [product, setProduct] = useState<ReserveSheetProduct | null>(props.product ?? null);
  const [quantity, setQuantity] = useState(props.quantity ?? 1);
  const [customerName, setCustomerName] = useState(props.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(props.customerPhone ?? "");
  const [days, setDays] = useState(String(defaultDays));
  const [note, setNote] = useState(props.note ?? "");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey("reserve"));

  const presetId = props.product?.id;
  const presetName = props.product?.name;
  const presetStock = props.product?.stock;
  const presetReserved = props.product?.reservedUnits;

  useEffect(() => {
    if (!open) return;
    setProduct(presetId ? { id: presetId, name: presetName ?? "", stock: presetStock, reservedUnits: presetReserved } : null);
    setQuantity(props.quantity ?? 1);
    setCustomerName(props.customerName ?? "");
    setCustomerPhone(props.customerPhone ?? "");
    setDays(String(defaultDays));
    setNote(props.note ?? "");
    setError(null);
    setIdempotencyKey(createIdempotencyKey("reserve"));
  }, [open, presetId, presetName, presetStock, presetReserved, props.quantity, props.customerName, props.customerPhone, props.note, defaultDays]);

  const available = useMemo(() => availableOf(product), [product]);
  const choose = (option?: AsyncProductOption | null) => {
    setProduct(option ? { id: option.id, name: option.name, stock: option.stock, reservedUnits: option.reservedUnits ?? 0 } : null);
    setError(null);
  };

  const submit = async () => {
    if (submitting.current) return;
    if (!product) return setError("Elige el producto que vas a reservar.");
    if (customerName.trim().length < 2) return setError("Escribe el nombre de la clienta.");
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const { data } = await axios.post(
        `/api/${params.storeId}/stock-reservations`,
        { productId: product.id, quantity, customerName, customerPhone, days: Number(days), note },
        { headers: { "Idempotency-Key": idempotencyKey } },
      );
      toast({
        variant: "success",
        title: "Reservado",
        description: `${quantity} × ${product.name} para ${customerName.trim()}. Ya no se vende en la tienda ni en Mercado Libre.`,
      });
      onOpenChange(false);
      if (data?.reservation) onCreated?.(data.reservation as CreatedReservation);
      router.refresh();
    } catch (cause) {
      const message = axios.isAxiosError(cause) ? (cause.response?.data?.error ?? cause.response?.data?.message) : null;
      setError(typeof message === "string" ? message : "No se pudo reservar. Intenta de nuevo.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl px-4 pb-6 sm:px-6">
        <SheetHeader className="text-left">
          <SheetTitle>Reservar</SheetTitle>
          <SheetDescription>
            Guarda unidades para una clienta. Dejan de venderse en la tienda, Mercado Libre y el punto de venta hasta que las conviertas en pedido o las liberes.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Producto</Label>
            {presetId ? (
              <p className="rounded-md border px-3 py-2 text-sm font-medium">{product?.name}</p>
            ) : (
              <div className="flex gap-2">
                <AsyncProductSelect
                  value={product?.id ?? ""}
                  onChange={(_value, option) => choose(option)}
                  placeholder="Busca por nombre, SKU o código"
                  modal="auto"
                  className="min-w-0 flex-1"
                  ariaLabel="Producto a reservar"
                />
                <ProductScanButton compact label="Escanear producto" onFound={(option) => (choose(option), scanAccepted())} />
              </div>
            )}
            {available !== null && (
              <p className="text-xs text-muted-foreground" data-testid="reserve-available">
                {reservableLine(product!.stock!, product!.reservedUnits)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reserve-quantity">Cantidad</Label>
              <StockQuantityInput
                id="reserve-quantity"
                value={quantity}
                onChange={setQuantity}
                min={1}
                max={available && available > 0 ? available : undefined}
                ariaLabel="Cantidad a reservar"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reserve-days">Días</Label>
              <Input id="reserve-days" inputMode="numeric" type="number" min={1} max={60} value={days} onChange={(event) => setDays(event.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reserve-name">Clienta</Label>
            <Input id="reserve-name" autoComplete="off" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre como aparece en el grupo" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reserve-phone">Celular (WhatsApp)</Label>
            <PhoneInput id="reserve-phone" value={customerPhone} onChange={(value) => setCustomerPhone(value ?? "")} placeholder="300 123 4567" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reserve-note">Nota (opcional)</Label>
            <Textarea id="reserve-note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej.: paga el viernes por transferencia" />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" className="min-h-11" onClick={submit} disabled={saving || available === 0}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Reservar {quantity > 1 ? `${quantity} unidades` : "1 unidad"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
