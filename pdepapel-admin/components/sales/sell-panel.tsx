"use client";

import {
  Banknote,
  CheckCircle2,
  Landmark,
  Package,
  ReceiptText,
  ScanLine,
  Trash2,
} from "lucide-react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { Separator } from "@/components/ui/separator";
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
import { cn, currencyFormatter } from "@/lib/utils";

export type { SellLine, SellPaymentMethod } from "@/lib/sell-cart";

export interface SellSubmitInput {
  lines: SellLine[];
  paymentMethod: SellPaymentMethod;
  idempotencyKey: string;
}

export interface SellSubmitResult {
  orderNumber: string;
  duplicate?: boolean;
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
  copy?: {
    addDescription?: string;
    pickerLabel?: string;
    scannerDescription?: string;
    confirmNote?: string;
  };
}

interface SellPanelProps {
  source: SellSource;
  /** Contenido bajo la tarjeta de cobro (por ejemplo, el cierre del día). */
  aside?: ReactNode;
  /** Sin tarjetas propias, para vivir dentro de otra tarjeta (feria). */
  embedded?: boolean;
  /** Mensaje de error genérico al cobrar. */
  submitErrorHint?: string;
}

function getErrorDescription(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { error?: string } } })?.response
    ?.data;
  return data?.error || fallback;
}

export function SellPanel({
  source,
  aside,
  embedded = false,
  submitErrorHint,
}: SellPanelProps) {
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
          submitErrorHint ??
            "No se descontó inventario. Revisa los productos e intenta de nuevo.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsSelling(false);
    }
  };

  const Section = ({
    title,
    description,
    icon,
    children,
    className,
  }: {
    title: string;
    description?: string;
    icon?: ReactNode;
    children: ReactNode;
    className?: string;
  }) =>
    embedded ? (
      <section className={cn("space-y-4 rounded-lg border p-4", className)}>
        <div>
          <p className="flex items-center gap-2 font-semibold">
            {icon}
            {title}
          </p>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children}
      </section>
    ) : (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    );

  return (
    <div
      className={cn(
        "grid gap-6",
        embedded
          ? "lg:grid-cols-[minmax(0,1fr)_320px]"
          : "lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]",
      )}
    >
      <div className={embedded ? "space-y-4" : "space-y-6"}>
        <Section
          title="Agregar productos"
          description={
            source.copy?.addDescription ??
            "Escanea una etiqueta, escribe el SKU o busca el producto. Cada lectura suma una unidad."
          }
          icon={
            <ScanLine className="h-4 w-4 text-primary" aria-hidden="true" />
          }
        >
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
              />
            </div>
            <BarcodeScanner
              onDetected={lookupCode}
              description={
                source.copy?.scannerDescription ??
                "Apunta la cámara a la etiqueta QR o al código de barras del producto."
              }
            />
            <Button
              type="button"
              onClick={() => void lookupCode(manualCode)}
              disabled={!manualCode.trim()}
              isLoading={isLookingUp}
            >
              Agregar código
            </Button>
          </div>
          {source.renderPicker && (
            <div className="grid gap-2">
              <Label>
                {source.copy?.pickerLabel ?? "Producto del catálogo"}
              </Label>
              {source.renderPicker(addLine)}
            </div>
          )}
        </Section>

        <Section
          title="Venta actual"
          description="Revisa las cantidades antes de confirmar el pago."
        >
          {cart.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aún no hay productos en esta venta.
            </div>
          ) : (
            <ul className="space-y-3">
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
                    <p className="truncate font-medium">{item.name}</p>
                    {item.detail && (
                      <p className="truncate text-xs text-muted-foreground">
                        {item.detail}
                      </p>
                    )}
                    <p className="text-sm font-semibold">
                      {currencyFormatter(item.price)}
                    </p>
                  </div>
                  {!item.fixedQuantity && (
                    <div className="hidden sm:block">
                      <QuantitySelector
                        value={item.quantity}
                        min={1}
                        max={item.maxQuantity ?? undefined}
                        onChange={(quantity) =>
                          updateQuantity(item.key, quantity)
                        }
                      />
                    </div>
                  )}
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
                  {!item.fixedQuantity && (
                    <div className="basis-full sm:hidden">
                      <QuantitySelector
                        value={item.quantity}
                        min={1}
                        max={item.maxQuantity ?? undefined}
                        onChange={(quantity) =>
                          updateQuantity(item.key, quantity)
                        }
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
        <Section
          title="Cobrar"
          description="El inventario se descuenta solo al confirmar."
          className={embedded ? "border-primary/30" : "border-primary/30"}
        >
          <div className="grid gap-2">
            <Label>Método de pago</Label>
            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Método de pago"
            >
              <Button
                type="button"
                role="radio"
                aria-checked={paymentMethod === "CASH"}
                variant={paymentMethod === "CASH" ? "default" : "outline"}
                onClick={() => setPaymentMethod("CASH")}
              >
                <Banknote className="mr-2 h-4 w-4" aria-hidden="true" />
                Efectivo
              </Button>
              <Button
                type="button"
                role="radio"
                aria-checked={paymentMethod === "BankTransfer"}
                variant={
                  paymentMethod === "BankTransfer" ? "default" : "outline"
                }
                onClick={() => setPaymentMethod("BankTransfer")}
              >
                <Landmark className="mr-2 h-4 w-4" aria-hidden="true" />
                Transferencia
              </Button>
            </div>
          </div>
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
            disabled={cart.length === 0}
            isLoading={isSelling}
            onClick={() => setIsConfirmationOpen(true)}
          >
            {!isSelling && (
              <ReceiptText className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Registrar pago
          </Button>
          <p className="flex gap-2 text-xs text-muted-foreground">
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
            {source.copy?.confirmNote ??
              "Si falta inventario, la venta no se registra ni descuenta parcialmente."}
          </p>
        </Section>
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
              Se registrará una venta presencial por{" "}
              {currencyFormatter(totals.total)} en{" "}
              {paymentMethod === "CASH" ? "efectivo" : "transferencia"} y se
              descontará el inventario de todos los productos.
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
