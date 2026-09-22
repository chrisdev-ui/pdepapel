"use client";

import { Banknote, CreditCard, Landmark, Package, ReceiptText, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SectionCard } from "@/components/ui/section-card";
import { Separator } from "@/components/ui/separator";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { scanAccepted, scanRejected, type ScanOutcome } from "@/lib/scan-outcome";
import {
  addLineToCart,
  cartTotals,
  createIdempotencyKey,
  removeLine,
  setLineQuantity,
  type SellLine,
  type SellPaymentMethod,
} from "@/lib/sell-cart";
import { cn, currencyFormatter } from "@/lib/utils";

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
  /** Referencia del comprobante (transferencia). */
  transactionId?: string;
}

export interface SellSubmitResult {
  orderNumber: string;
  orderId?: string;
  duplicate?: boolean;
  /** El cobro sigue en el datáfono: la venta queda pendiente hasta que Bold confirme. */
  pending?: boolean;
  paidAt?: string | null;
  /** Mensaje del datáfono al recibir el cobro. */
  terminal?: string | null;
}

/** Lo que la pantalla sabe de la venta recién registrada, para la tarjeta de después. */
export interface SellCompletedSale extends SellSubmitResult {
  lines: SellLine[];
  paymentMethod: SellPaymentMethod;
  total: number;
  units: number;
  savings: number;
  transactionId?: string;
  at: Date;
  /** Se deshizo desde la tarjeta: pedido cancelado e inventario devuelto. */
  undone?: boolean;
  /** Bold rechazó o canceló el cobro del datáfono. */
  cancelled?: boolean;
}

export interface SellAfterSaleActions {
  /** Limpia la tarjeta y arranca la siguiente venta. */
  reset: () => void;
  /** Actualiza la venta mostrada (pagada por Bold, deshecha, cancelada) y la conserva. */
  update: (patch: Partial<SellCompletedSale>) => void;
}

export interface SellPaymentOption {
  value: SellPaymentMethod;
  title: string;
  hint?: string;
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
  lookup?: (code: string) => Promise<SellLine>;
  /** Registra la venta; el servidor descuenta inventario una sola vez. */
  submit: (input: SellSubmitInput) => Promise<SellSubmitResult>;
  /**
   * Selector alterno al lector (catálogo, productos reservados).
   *
   * `add` contesta si la línea entró: el lector necesita saberlo para sonar
   * distinto cuando el producto llegó al tope de unidades.
   */
  renderPicker?: (add: (line: SellLine) => Promise<boolean>) => ReactNode;
  /**
   * Una sola entrada (buscar o escanear) que reemplaza al lector con casilla
   * de código y al selector: el punto de venta la usa; las ferias no.
   */
  renderEntry?: (add: (line: SellLine) => Promise<boolean>) => ReactNode;
  /** Métodos de pago que ofrece la pantalla; por defecto efectivo y transferencia. */
  paymentOptions?: SellPaymentOption[];
  /** Pide la referencia del comprobante al cobrar por transferencia (misma regla que Pedidos). */
  requireTransferReference?: boolean;
  /** Tarjeta que reemplaza al aviso flotante cuando la venta queda registrada. */
  renderAfterSale?: (sale: SellCompletedSale, actions: SellAfterSaleActions) => ReactNode;
  /**
   * Vuelve a preguntarle al servidor cuánto vale cada línea con la cantidad
   * que hay ahora. Con escalera por cantidad el unitario depende de cuántas
   * lleve, así que multiplicar aquí diría un número y la venta guardaría otro.
   * Sin esto, el panel se queda con el precio que trajo la línea.
   */
  reprice?: (
    lines: { productId: string; quantity: number }[],
  ) => Promise<Map<string, { unitPrice: number; originalPrice: number; offerLabel: string | null }>>;
  copy?: SellSourceCopy;
}

interface SellPanelProps {
  source: SellSource;
  /** Contenido bajo la tarjeta de cobro (por ejemplo, el cierre del día). */
  aside?: ReactNode;
  /** Bloquea la venta (por ejemplo, feria en conciliación) y explica por qué. */
  lockedReason?: ReactNode;
  /**
   * Clave de sessionStorage para conservar la tarjeta de la última venta:
   * `router.refresh()` vuelve a montar la pantalla (template + loading del
   * panel) y sin esto la tarjeta desaparecía justo después de registrar.
   */
  persistLastSaleKey?: string;
}

function readPersistedSale(key: string): SellCompletedSale | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SellCompletedSale & { at: string };
    return { ...parsed, at: new Date(parsed.at) };
  } catch {
    return null;
  }
}

function writePersistedSale(key: string, sale: SellCompletedSale | null) {
  try {
    if (sale) window.sessionStorage.setItem(key, JSON.stringify(sale));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Sin almacenamiento (modo privado) la tarjeta simplemente no sobrevive al refresco.
  }
}

const DEFAULT_PAYMENT_OPTIONS: SellPaymentOption[] = [
  { value: "CASH", title: "Efectivo" },
  { value: "BankTransfer", title: "Transferencia" },
];

const PAYMENT_ICONS: Record<SellPaymentMethod, ReactNode> = {
  CASH: <Banknote className="h-4 w-4" aria-hidden="true" />,
  BankTransfer: <Landmark className="h-4 w-4" aria-hidden="true" />,
  Bold: <CreditCard className="h-4 w-4" aria-hidden="true" />,
};

export const PAYMENT_LABELS: Record<SellPaymentMethod, string> = {
  CASH: "efectivo",
  BankTransfer: "transferencia",
  Bold: "datáfono",
};

export const TRANSFER_REFERENCE_MIN = 4;

function getErrorDescription(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { error?: string } } })?.response
    ?.data;
  return data?.error || fallback;
}

/** Métodos de pago como radios compactos: tres caben en un teléfono de 390 px. */
function PaymentMethodPicker({
  value,
  onChange,
  options,
  disabled,
}: {
  value: SellPaymentMethod;
  onChange: (value: SellPaymentMethod) => void;
  options: SellPaymentOption[];
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as SellPaymentMethod)}
      aria-label="Método de pago"
      disabled={disabled}
      className={cn("grid gap-2", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}
    >
      {options.map((option) => {
        const id = `sell-panel-payment-${option.value}`;
        const active = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              "flex min-h-[60px] min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border bg-white px-1.5 py-2 text-center font-semibold text-primary transition-colors hover:border-primary/40",
              active && "border-primary bg-accent/40",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <RadioGroupItem value={option.value} id={id} className="sr-only" />
            {/* Ícono encima del texto: «Transferencia» no cabe al lado en tres columnas, ni en 390 px ni en la tarjeta de 360 px. */}
            {PAYMENT_ICONS[option.value]}
            <span className="max-w-full truncate text-xs leading-tight sm:text-[13px]">{option.title}</span>
            {option.hint && <span className="hidden max-w-full truncate text-[11px] font-normal text-muted-foreground sm:block">{option.hint}</span>}
          </label>
        );
      })}
    </RadioGroup>
  );
}

export function SellPanel({ source, aside, lockedReason, persistLastSaleKey }: SellPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [cart, setCart] = useState<SellLine[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SellPaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [lastSale, setLastSale] = useState<SellCompletedSale | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createIdempotencyKey(),
  );

  // La tarjeta guardada se lee al montar (no en el primer render: el servidor no la conoce).
  useEffect(() => {
    if (!persistLastSaleKey) return;
    const saved = readPersistedSale(persistLastSaleKey);
    if (saved) setLastSale(saved);
  }, [persistLastSaleKey]);

  const showLastSale = useCallback(
    (sale: SellCompletedSale | null) => {
      setLastSale(sale);
      if (persistLastSaleKey) writePersistedSale(persistLastSaleKey, sale);
    },
    [persistLastSaleKey],
  );

  const afterSaleActions = useMemo<SellAfterSaleActions>(
    () => ({
      reset: () => {
        showLastSale(null);
        setCart([]);
        setReference("");
        setPaymentMethod("CASH");
      },
      update: (patch) => {
        setLastSale((current) => {
          if (!current) return current;
          const next = { ...current, ...patch };
          if (persistLastSaleKey) writePersistedSale(persistLastSaleKey, next);
          return next;
        });
      },
    }),
    [persistLastSaleKey, showLastSale],
  );

  const totals = useMemo(() => cartTotals(cart), [cart]);
  const locked = Boolean(lockedReason);
  const copy = source.copy ?? {};
  const paymentOptions = source.paymentOptions ?? DEFAULT_PAYMENT_OPTIONS;
  const needsReference = Boolean(source.requireTransferReference) && paymentMethod === "BankTransfer";
  const referenceOk = !needsReference || reference.trim().length >= TRANSFER_REFERENCE_MIN;

  /**
   * Agrega y contesta si entró.
   *
   * La respuesta no es un lujo: el carrito rechaza la unidad cuando ya se
   * llegó al stock, y ese es justo el caso de escanear la misma etiqueta
   * varias veces. Sin saberlo, el lector pitaría «aceptado» en la lectura que
   * no sumó nada, que es peor que no pitar. El aviso se resuelve dentro del
   * actualizador porque es donde se conoce el carrito de ese momento; volver
   * a leerlo fuera daría el valor anterior.
   */
  const addLine = useCallback(
    (line: SellLine) =>
      new Promise<boolean>((resolve) => {
        showLastSale(null);
        setCart((current) => {
          const change = addLineToCart(current, line);
          if (change.error) {
            const { title, description } = change.error;
            setTimeout(
              () => toast({ title, description, variant: "destructive" }),
              0,
            );
          }
          resolve(!change.error);
          return change.cart;
        });
      }),
    [showLastSale, toast],
  );

  const lookupCode = useCallback(
    async (rawCode: string): Promise<ScanOutcome> => {
      const code = rawCode.trim();
      if (!code || !source.lookup) return scanRejected();
      try {
        setIsLookingUp(true);
        const line = await source.lookup(code);
        const added = await addLine(line);
        setManualCode("");
        return added ? scanAccepted(line.name) : scanRejected(line.name);
      } catch (error) {
        toast({
          title: "Código no disponible",
          description: getErrorDescription(
            error,
            "Revisa el código y vuelve a intentar.",
          ),
          variant: "destructive",
        });
        return scanRejected();
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

  /**
   * Cuando cambian las cantidades, le pregunta al servidor cuánto vale cada
   * línea. Va en un efecto y no dentro de `setCart` porque React puede llamar
   * dos veces a un actualizador, y eso serían dos consultas por cada clic.
   *
   * Si la consulta falla, el carrito se queda con el precio que tenía: es
   * mejor que vaciarlo, y el servidor vuelve a calcular el precio al cobrar de
   * todas formas.
   */
  const quantitySignature = cart
    .filter((line) => line.kind === "product")
    .map((line) => `${line.productId}:${line.quantity}`)
    .join(",");
  const reprice = source.reprice;
  useEffect(() => {
    if (!reprice || quantitySignature === "") return;
    let cancelled = false;
    const lines = quantitySignature.split(",").map((entry) => {
      const [productId, quantity] = entry.split(":");
      return { productId, quantity: Number(quantity) };
    });
    void reprice(lines)
      .then((priced) => {
        if (cancelled) return;
        setCart((current) =>
          current.map((line) => {
            if (line.kind !== "product") return line;
            const fresh = priced.get(line.productId);
            if (!fresh || fresh.unitPrice === line.price) return line;
            return {
              ...line,
              price: fresh.unitPrice,
              originalPrice: fresh.originalPrice,
              offerLabel: fresh.offerLabel,
            };
          }),
        );
      })
      .catch(() => {
        // Silencio a propósito: ver arriba.
      });
    return () => {
      cancelled = true;
    };
  }, [quantitySignature, reprice]);

  const registerSale = async () => {
    if (cart.length === 0 || !referenceOk) return;
    try {
      setIsSelling(true);
      setIsConfirmationOpen(false);
      const result = await source.submit({
        lines: cart,
        paymentMethod,
        idempotencyKey,
        transactionId: needsReference ? reference.trim() : undefined,
      });
      const completed: SellCompletedSale = {
        ...result,
        lines: cart,
        paymentMethod,
        total: totals.total,
        units: totals.units,
        savings: totals.savings,
        transactionId: needsReference ? reference.trim() : undefined,
        at: new Date(),
      };
      setCart([]);
      setReference("");
      setIdempotencyKey(createIdempotencyKey());
      if (source.renderAfterSale) {
        showLastSale(completed);
      } else {
        toast({
          title: result.duplicate ? "Venta ya registrada" : "Venta registrada",
          description: `Pedido ${result.orderNumber} marcado como pagado.`,
          variant: "success",
        });
      }
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

  const registerButton = (className?: string) => (
    <Button
      type="button"
      size="lg"
      className={cn("w-full", className)}
      disabled={locked || cart.length === 0}
      isLoading={isSelling}
      onClick={() => setIsConfirmationOpen(true)}
    >
      {!isSelling && <ReceiptText className="mr-2 h-4 w-4" aria-hidden="true" />}
      Registrar pago
    </Button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
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
        {source.renderEntry ? (
          !locked && source.renderEntry(addLine)
        ) : (
          <>
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
          </>
        )}

        <Separator />

        {lastSale && source.renderAfterSale && source.renderAfterSale(lastSale, afterSaleActions)}

        {cart.length === 0 ? (
          !lastSale && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground sm:p-8">
              Aún no hay productos en esta venta.
            </div>
          )
        ) : (
          <ul className="space-y-2.5" aria-label="Productos en la venta">
            {cart.map((item) => (
              <li
                key={item.key}
                // Teléfono: rejilla de tres columnas (foto · datos · papelera) y una segunda
                // fila con cantidad y total. Desde tableta: una sola fila foto · datos · cantidad · total · papelera.
                className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2.5 rounded-xl border p-3 sm:flex sm:items-center"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Package className="h-5 w-5" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1 sm:flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold leading-tight">
                    <span className="min-w-0 break-words">{item.name}</span>
                    {item.chips?.map((chip) => (
                      <TintBadge key={chip} tone="lavender" label={chip} className="text-[11px]" />
                    ))}
                    {item.kind === "capsule" && item.capsuleCode && (
                      <TintBadge tone="lavender" label={item.capsuleCode} />
                    )}
                  </p>
                  {item.detail && (
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {item.detail}
                    </p>
                  )}
                  {item.originalPrice != null && item.originalPrice > item.price && (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs">
                      <TintBadge tone="cream" label={item.offerLabel ?? "Oferta"} className="text-[11px]" />
                      <span className="text-muted-foreground">
                        antes <span className="line-through">{currencyFormatter(item.originalPrice)}</span>
                      </span>
                    </p>
                  )}
                  {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="-mr-1 -mt-1 sm:order-last sm:m-0"
                  onClick={() =>
                    setCart((current) => removeLine(current, item.key))
                  }
                  aria-label={`Quitar ${item.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div className="col-span-2 col-start-2 flex items-center justify-between gap-3 sm:contents">
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
                      className="w-32 shrink-0"
                      ariaLabel={`Cantidad de ${item.name}`}
                      onChange={(quantity) =>
                        updateQuantity(item.key, quantity)
                      }
                    />
                  )}
                  <div className="flex shrink-0 flex-col items-end sm:min-w-[6.5rem]">
                    <span className="text-sm font-bold tabular-nums">
                      {currencyFormatter(item.price * item.quantity)}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {item.quantity} × {currencyFormatter(item.price)}
                    </span>
                  </div>
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
          <PaymentMethodPicker
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={paymentOptions}
            disabled={locked}
          />
          {paymentMethod === "Bold" && (
            <p className="text-xs text-muted-foreground">
              El cobro se envía al datáfono Bold. La venta queda pagada, y descuenta inventario, cuando Bold confirma; igual que en Pedidos.
            </p>
          )}
          <Separator />
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm text-muted-foreground">Total a cobrar</p>
              <p className="text-3xl font-bold tabular-nums">
                {currencyFormatter(totals.total)}
              </p>
              <p className="text-xs text-muted-foreground">
                {totals.units} unidad{totals.units === 1 ? "" : "es"} en la venta
                {totals.savings > 0 ? ` · ahorra ${currencyFormatter(totals.savings)} con las ofertas vigentes` : ""}
              </p>
            </div>
          </div>
          <div className="hidden lg:block">{registerButton()}</div>
          <p className="hidden text-xs text-muted-foreground lg:block">
            {copy.confirmNote ??
              "Si falta inventario, la venta no se registra ni descuenta parcialmente."}
          </p>
        </SectionCard>
        {aside}
      </aside>

      {/* En teléfono y tableta el total y «Registrar pago» quedan fijos abajo mientras haya algo que cobrar. */}
      {cart.length > 0 && (
        <div className="sticky bottom-2 z-10 flex items-center justify-between gap-3 rounded-xl border bg-white/95 p-3 shadow-md backdrop-blur lg:hidden">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground">Total · {totals.units} und</span>
            <span className="text-lg font-bold tabular-nums">{currencyFormatter(totals.total)}</span>
          </div>
          {registerButton("w-auto flex-1 max-w-[220px]")}
        </div>
      )}

      <AlertDialog
        open={isConfirmationOpen}
        onOpenChange={setIsConfirmationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{paymentMethod === "Bold" ? "¿Enviar el cobro al datáfono?" : "¿Confirmar pago?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {paymentMethod === "Bold"
                ? `Se crea la ${copy.saleNoun ?? "venta presencial"} por ${currencyFormatter(totals.total)} y se manda el cobro al datáfono. El inventario se descuenta cuando Bold confirme.`
                : `Se registrará una ${copy.saleNoun ?? "venta presencial"} por ${currencyFormatter(totals.total)} en ${PAYMENT_LABELS[paymentMethod]} y se descontará el inventario de todos los productos.`}
              {totals.savings > 0 ? ` Incluye ${currencyFormatter(totals.savings)} de rebaja por ofertas vigentes.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsReference && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sell-panel-reference">Referencia de la transferencia</Label>
              <Input
                id="sell-panel-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Número del comprobante o de la transacción"
                autoComplete="off"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Mínimo cuatro caracteres. Queda en el pedido, como al marcar pagado en Pedidos.</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSelling}>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={registerSale} disabled={isSelling || !referenceOk}>
              {paymentMethod === "Bold" ? "Sí, enviar al datáfono" : "Sí, registrar pago"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
