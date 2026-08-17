"use client";

import axios from "axios";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Package,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  ScanLine,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import {
  printQrLabelSheet,
  QrLabelPrintSheet,
  type QrPrintLabel,
} from "@/components/labels/qr-label-print-sheet";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CountInput } from "@/components/ui/count-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AsyncProductSelect, type AsyncProductOption } from "@/components/ui/async-product-select";
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
import { useToast } from "@/hooks/use-toast";
import {
  LABEL_PRINT_FORMATS,
  type LabelPrintFormat,
} from "@/lib/label-printing";

type PaymentMethod = "CASH" | "BankTransfer";

type PointOfSaleProduct = {
  id: string;
  name: string;
  sku: string;
  gtin: string | null;
  stock: number;
  price: number;
  isKit: boolean;
  images: { url: string }[];
};

type CartItem = PointOfSaleProduct & { quantity: number };

type LabelProduct = Pick<
  PointOfSaleProduct,
  "id" | "name" | "sku" | "images"
>;

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || fallback;
  }
  return fallback;
}

function toPointOfSaleProduct(product: AsyncProductOption): PointOfSaleProduct {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    gtin: product.gtin || null,
    stock: product.stock,
    price: Number(product.price || 0),
    isKit: Boolean(product.isKit),
    images: product.images || [],
  };
}

export function PointOfSaleWorkspace() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [labelProduct, setLabelProduct] = useState<LabelProduct | null>(null);
  const [labelCopies, setLabelCopies] = useState(1);
  const [labels, setLabels] = useState<LabelProduct[]>([]);
  const [labelPrintFormat, setLabelPrintFormat] =
    useState<LabelPrintFormat>("COMPACT_65");

  const total = useMemo(
    () =>
      cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );
  const printableLabels = useMemo<QrPrintLabel[]>(
    () =>
      labels.map((product) => ({
        id: product.id,
        code: `PDP:${product.id}`,
        title: product.name,
        subtitle: `SKU: ${product.sku}`,
      })),
    [labels],
  );

  const addProduct = useCallback(
    (product: PointOfSaleProduct) => {
      if (product.stock <= 0) {
        toast({
          title: "Producto agotado",
          description: "Actualiza el inventario antes de registrarlo.",
          variant: "destructive",
        });
        return;
      }

      setCart((current) => {
        const existing = current.find((item) => item.id === product.id);
        if (existing && existing.quantity >= product.stock) {
          toast({
            title: "No hay más unidades disponibles",
            description: `Solo quedan ${product.stock} unidades de ${product.name}.`,
            variant: "destructive",
          });
          return current;
        }
        if (existing) {
          return current.map((item) =>
            item.id === product.id
              ? { ...item, quantity: item.quantity + 1, stock: product.stock }
              : item,
          );
        }
        return [...current, { ...product, quantity: 1 }];
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
        const response = await axios.get(
          `/api/${params.storeId}/point-of-sale/lookup`,
          { params: { code } },
        );
        addProduct(response.data.product as PointOfSaleProduct);
        setManualCode("");
      } catch (error) {
        toast({
          title: "Código no disponible",
          description: getErrorMessage(
            error,
            "Revisa el código y vuelve a intentar.",
          ),
          variant: "destructive",
        });
      } finally {
        setIsLookingUp(false);
      }
    },
    [addProduct, params.storeId, toast],
  );

  function updateQuantity(productId: string, quantity: number) {
    setCart((current) =>
      current.map((item) =>
        item.id === productId
          ? { ...item, quantity: Math.min(Math.max(1, quantity), item.stock) }
          : item,
      ),
    );
  }

  async function registerSale() {
    if (cart.length === 0) return;

    try {
      setIsSelling(true);
      setIsConfirmationOpen(false);
      const response = await axios.post(
        `/api/${params.storeId}/point-of-sale/sales`,
        {
          items: cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
          paymentMethod,
          idempotencyKey,
        },
      );
      setCart([]);
      setIdempotencyKey(createIdempotencyKey());
      toast({
        title: response.data.duplicate ? "Venta ya registrada" : "Venta registrada",
        description: `Pedido ${response.data.order.orderNumber} marcado como pagado.`,
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudo registrar la venta",
        description: getErrorMessage(
          error,
          "No se descontó inventario. Revisa los productos e intenta de nuevo.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsSelling(false);
    }
  }

  function addLabels() {
    if (!labelProduct) {
      toast({ title: "Selecciona un producto", variant: "destructive" });
      return;
    }

    setLabels((current) => [
      ...current,
      ...Array.from({ length: labelCopies }, () => labelProduct),
    ]);
    toast({
      title: "Etiquetas listas",
      description: `${labelCopies} etiqueta${labelCopies === 1 ? "" : "s"} agregada${labelCopies === 1 ? "" : "s"} para imprimir.`,
      variant: "success",
    });
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <ScanLine className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Punto de venta</h1>
              <p className="text-sm text-muted-foreground">
                Registra ventas presenciales y descuenta el inventario al instante.
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Agregar productos</CardTitle>
            <CardDescription>
              Escanea una etiqueta, escribe el SKU o selecciona un producto del catálogo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="point-of-sale-code">Código de barras o QR</Label>
                <Input
                  id="point-of-sale-code"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void lookupCode(manualCode);
                    }
                  }}
                  placeholder="Escanea o escribe el código"
                />
              </div>
              <BarcodeScanner
                onDetected={lookupCode}
                description="Apunta la cámara a la etiqueta QR o al código de barras del producto."
              />
              <Button
                type="button"
                onClick={() => void lookupCode(manualCode)}
                disabled={isLookingUp || !manualCode.trim()}
              >
                {isLookingUp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Agregar código
              </Button>
            </div>
            <div className="grid gap-2">
              <Label>Producto del catálogo</Label>
              <AsyncProductSelect
                value=""
                onChange={(_value, product) => {
                  if (product) addProduct(toPointOfSaleProduct(product));
                }}
                placeholder="Busca por nombre, SKU o código"
                modal
                ariaLabel="Agregar producto del catálogo"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Venta actual</CardTitle>
            <CardDescription>
              Revisa las cantidades antes de confirmar el pago.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                Aún no hay productos en esta venta.
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {item.images[0]?.url ? (
                        <Image
                          src={item.images[0].url}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <Package className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.isKit ? "Kit" : "Producto"} · SKU: {item.sku} · {item.stock} disponibles
                      </p>
                      <p className="text-sm font-semibold">{formatCurrency(item.price)}</p>
                    </div>
                    <div className="hidden sm:block">
                      <QuantitySelector
                        value={item.quantity}
                        min={1}
                        max={item.stock}
                        onChange={(quantity) => updateQuantity(item.id, quantity)}
                      />
                    </div>
                    <span className="w-24 text-right text-sm font-semibold">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setCart((current) => current.filter((cartItem) => cartItem.id !== item.id))
                      }
                      aria-label={`Quitar ${item.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="col-span-full sm:hidden">
                      <QuantitySelector
                        value={item.quantity}
                        min={1}
                        max={item.stock}
                        onChange={(quantity) => updateQuantity(item.id, quantity)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Imprimir etiquetas de productos
            </CardTitle>
            <CardDescription>
              Una etiqueta se reutiliza: pégala en el producto y escanéala cada vez que lo vendas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="grid min-w-0 gap-2">
                <Label>Producto</Label>
                <AsyncProductSelect
                  value={labelProduct?.id ?? ""}
                  onChange={(_value, product) => {
                    if (product) {
                      const normalized = toPointOfSaleProduct(product);
                      setLabelProduct(normalized);
                    }
                  }}
                  placeholder="Busca el producto para etiquetar"
                  modal
                  ariaLabel="Producto para imprimir etiquetas"
                  className="h-11 py-0"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,0.8fr)_minmax(260px,1fr)_minmax(180px,0.7fr)] xl:items-end">
                <div className="grid gap-2">
                  <Label htmlFor="label-copies">Etiquetas</Label>
                  <CountInput
                    id="label-copies"
                    min={1}
                    max={100}
                    value={labelCopies}
                    onChange={setLabelCopies}
                    ariaLabel="Cantidad de etiquetas"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="label-print-format">Formato de hoja</Label>
                  <Select
                    value={labelPrintFormat}
                    onValueChange={(value) =>
                      setLabelPrintFormat(value as LabelPrintFormat)
                    }
                  >
                    <SelectTrigger id="label-print-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(LABEL_PRINT_FORMATS).map((format) => (
                        <SelectItem key={format.id} value={format.id}>
                          {format.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:col-span-2 xl:col-span-1"
                  onClick={addLabels}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar
                </Button>
              </div>
            </div>
            {labels.length > 0 && (
              <div className="rounded-lg border border-dashed p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {labels.length} etiqueta{labels.length === 1 ? "" : "s"} lista{labels.length === 1 ? "" : "s"} para imprimir.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {LABEL_PRINT_FORMATS[labelPrintFormat].description}. Usa hoja adhesiva A4 para inkjet y escala 100%.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!printQrLabelSheet("product")) {
                        toast({
                          title: "No se pudo abrir la impresión",
                          description:
                            "Permite las ventanas emergentes e inténtalo de nuevo.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir etiquetas
                  </Button>
                </div>
                <QrLabelPrintSheet
                  target="product"
                  labels={printableLabels}
                  format={labelPrintFormat}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-6 lg:h-fit">
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Confirmar pago</CardTitle>
            <CardDescription>El inventario se descuenta solo al confirmar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label>Método de pago</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={paymentMethod === "CASH" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("CASH")}
                >
                  <Banknote className="mr-2 h-4 w-4" />
                  Efectivo
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "BankTransfer" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("BankTransfer")}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Transferencia
                </Button>
              </div>
            </div>
            <Separator />
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total a cobrar</p>
              <p className="text-3xl font-bold">{formatCurrency(total)}</p>
              <p className="text-xs text-muted-foreground">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} unidades en la venta
              </p>
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={cart.length === 0 || isSelling}
              onClick={() => setIsConfirmationOpen(true)}
            >
              {isSelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-2 h-4 w-4" />}
              Registrar pago
            </Button>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              Si falta inventario, la venta no se registra ni descuenta parcialmente.
            </p>
          </CardContent>
        </Card>
      </aside>

      <AlertDialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Se registrará una venta presencial por {formatCurrency(total)} y se descontará el inventario de todos los productos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSelling}>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={registerSale} disabled={isSelling}>
              {isSelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sí, registrar pago
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
