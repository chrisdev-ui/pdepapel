"use client";

import { Banknote, Landmark, Package, ReceiptText, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";

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
import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioCards } from "@/components/ui/radio-cards";
import { SectionCard } from "@/components/ui/section-card";
import { Separator } from "@/components/ui/separator";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import {
  addLineToCart,
  cartTotals,
  createIdempotencyKey,
  removeLine,
  setLineQuantity,
  type SellLine,
  type SellPaymentMethod,
} from "@/lib/sell-cart";
import { currencyFormatter } from "@/lib/utils";

export type {
  SellLine,
  SellLineKind,
  SellPaymentMethod,
  SellSaleItem,
} from "@/lib/sell-cart";

export interface SellSubmitInput {
  /** Líneas con `kind` y, en cápsulas, `capsuleCode` explícitos. */
  lines: SellLine[];
  paymentMethod: SellPaymentMethod;
  idempotencyKey: string;
}

export interface SellSubmitResult {
  orderNumber: string;
  duplicate?: boolean;
}

/** Textos que cambian según la fuente; todo lo demás es igual en ambas pantallas. */
export interface SellSourceCopy {
  /** Ayuda bajo «Productos»: qué se puede escanear o buscar aquí. */
  addDescription?: string;
  /** Etiqueta del selector alterno (catálogo, reservados). */
  pickerLabel?: string;
  /** Ayuda del lector de cámara. */
  scannerDescription?: string;
  /** Nota bajo «Registrar pago». */
  confirmNote?: string;
  /** Descripción del error de cobro cuando el servidor no devuelve mensaje. */
  submitError?: string;
  /** Cómo se llama la venta en el diálogo («venta presencial», «venta de feria»). */
  saleNoun?: string;
}

/**
 * Lo que cambia entre el punto de venta y una feria: de dónde salen los
 * productos y a qué endpoint se cobra. La pantalla es la misma.
 */
export interface SellSource {
  /** Resuelve un código escaneado o escrito a una línea del carrito. Lanza si no existe. */
  lookup: (code: string) => Promise<SellLine>;
  /** Registra la venta; el servidor descuenta inventario una sola vez. */
  submit: (input: SellSubmitInput) => Promise<SellSubmitResult>;
  /** Selector alterno al lector (catálogo, productos reservados). */
  renderPicker?: (add: (line: SellLine) => void) => ReactNode;
  copy?: SellSourceCopy;
}

interface SellPanelProps {
  source: SellSource;
  /** Contenido bajo la tarjeta de cobro (por ejemplo, el cierre del día). */
  aside?: ReactNode;
  /** Bloquea la venta (por ejemplo, feria en conciliación) y explica por qué. */
  lockedReason?: ReactNode;
}

const PAYMENT_OPTIONS = [
  {
    value: "CASH" as const,
    title: "Efectivo",
    icon: <Banknote className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: "BankTransfer" as const,
    title: "Transferencia",
    icon: <Landmark className="h-4 w-4" aria-hidden="true" />,
  },
];

const PAYMENT_LABELS: Record<SellPaymentMethod, string> = {
  CASH: "efectivo",
  BankTransfer: "transferencia",
};

function getErrorDescription(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { error?: string } } })?.response
    ?.data;
  return data?.error || fallback;
}

export function SellPanel({ source, aside, lockedReason }: SellPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [cart, setCart] = useState<SellLine[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SellPaymentMethod>("CASH");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createIdempotencyKey(),
  );

  const totals = useMemo(() => cartTotals(cart), [cart]);
  const locked = Boolean(lockedReason);
  const copy = source.copy ?? {};

  const addLine = useCallback(
    (line: SellLine) => {
      setCart((current) => {
        const change = addLineToCart(current, line);
        if (change.error) {
          const { title, description } = change.error;
          setTimeout(
            () => toast({ title, description, variant: "destructive" }),
            0,
          );
        }
        return change.cart;
      });
    },
    [toast],
  );

  const lookupCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      try {
        setIsLookingUp(true);
        const line = await source.lookup(code);
        addLine(line);
        setManualCode("");
      } catch (error) {
        toast({
          title: "Código no disponible",
          description: getErrorDescription(
            error,
            "Revisa el código y vuelve a intentar.",
          ),
          variant: "destructive",
        });
      } finally {
        setIsLookingUp(false);
      }
    },
    [addLine, source, toast],
  );

  const updateQuantity = (key: string, quantity: number) => {
    setCart((current) => {
      const change = setLineQuantity(current, key, quantity);
      if (change.error) {
        const { title, description } = change.error;
        setTimeout(
          () => toast({ title, description, variant: "destructive" }),
          0,
        );
      }
      return change.cart;
    });
  };

  const registerSale = async () => {
    if (cart.length === 0) return;
    try {
      setIsSelling(true);
      setIsConfirmationOpen(false);
      const result = await source.submit({
        lines: cart,
        paymentMethod,
        idempotencyKey,
      });
      setCart([]);
      setIdempotencyKey(createIdempotencyKey());
      toast({
        title: result.duplicate ? "Venta ya registrada" : "Venta registrada",
        description: `Pedido ${result.orderNumber} marcado como pagado.`,
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudo registrar la venta",
        description: getErrorDescription(
          error,
          copy.submitError ??
            "No se descontó inventario. Revisa los productos e intenta de nuevo.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsSelling(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
      <SectionCard
        id="sell-productos"
        title="Productos"
        description={
          copy.addDescription ??
          "Escanea el QR o busca por nombre o SKU. El stock que ves es el de este momento."
        }
        action={
          totals.units > 0 ? (
            <TintBadge
              tone="sky"
              label={`${totals.units} unidad${totals.units === 1 ? "" : "es"}`}
            />
          ) : undefined
        }
      >
        {lockedReason && (
          <div
            role="status"
            className="rounded-lg border border-tint-cream bg-tint-cream/60 p-3 text-sm text-primary"
          >
            {lockedReason}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="sell-panel-code">Código de barras o QR</Label>
            <Input
              id="sell-panel-code"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void lookupCode(manualCode);
                }
              }}
              placeholder="Escanea o escribe el código"
              autoComplete="off"
              disabled={locked}
            />
          </div>
          <BarcodeScanner
            onDetected={lookupCode}
            description={
              copy.scannerDescription ??
              "Apunta la cámara a la etiqueta QR o al código de barras del producto."
            }
          />
          <Button
            type="button"
            onClick={() => void lookupCode(manualCode)}
            disabled={locked || !manualCode.trim()}
            isLoading={isLookingUp}
          >
            Agregar código
          </Button>
        </div>
        {source.renderPicker && !locked && (
          <div className="grid gap-2">
            <Label>{copy.pickerLabel ?? "Producto del catálogo"}</Label>
            {source.renderPicker(addLine)}
          </div>
        )}

        <Separator />

        {cart.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aún no hay productos en esta venta.
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Productos en la venta">
            {cart.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt=""
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Package className="h-5 w-5" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{item.name}</span>
                    {item.kind === "capsule" && item.capsuleCode && (
                      <TintBadge tone="lavender" label={item.capsuleCode} />
                    )}
                  </p>
                  {item.detail && (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  )}
                  <p className="text-sm font-semibold">
                    {currencyFormatter(item.price)}
                  </p>
                </div>
                <span className="w-24 text-right text-sm font-semibold tabular-nums">
                  {currencyFormatter(item.price * item.quantity)}
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() =>
                    setCart((current) => removeLine(current, item.key))
                  }
                  aria-label={`Quitar ${item.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div className="basis-full sm:order-none sm:basis-auto">
                  {item.fixedQuantity ? (
                    <span className="text-xs text-muted-foreground">
                      1 unidad · cantidad fija
                    </span>
                  ) : (
                    <StockQuantityInput
                      value={item.quantity}
                      min={1}
                      max={item.maxQuantity ?? undefined}
                      size="sm"
                      className="w-36"
                      ariaLabel={`Cantidad de ${item.name}`}
                      onChange={(quantity) =>
                        updateQuantity(item.key, quantity)
                      }
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
        <SectionCard
          id="sell-cobro"
          title="Cobro"
          description="El inventario se descuenta solo al confirmar."
          action={<TintBadge tone="mint" label="Todo o nada" />}
        >
          <RadioCards
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={PAYMENT_OPTIONS}
            label="Método de pago"
            idPrefix="sell-panel-payment"
            columns={2}
            disabled={locked}
          />
          <Separator />
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total a cobrar</p>
            <p className="text-3xl font-bold tabular-nums">
              {currencyFormatter(totals.total)}
            </p>
            <p className="text-xs text-muted-foreground">
              {totals.units} unidad{totals.units === 1 ? "" : "es"} en la venta
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={locked || cart.length === 0}
            isLoading={isSelling}
            onClick={() => setIsConfirmationOpen(true)}
          >
            {!isSelling && (
              <ReceiptText className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Registrar pago
          </Button>
          <p className="text-xs text-muted-foreground">
            {copy.confirmNote ??
              "Si falta inventario, la venta no se registra ni descuenta parcialmente."}
          </p>
        </SectionCard>
        {aside}
      </aside>

      <AlertDialog
        open={isConfirmationOpen}
        onOpenChange={setIsConfirmationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Se registrará una {copy.saleNoun ?? "venta presencial"} por{" "}
              {currencyFormatter(totals.total)} en{" "}
              {PAYMENT_LABELS[paymentMethod]} y se descontará el inventario de
              todos los productos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSelling}>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={registerSale} disabled={isSelling}>
              Sí, registrar pago
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
