"use client";

import { Plus, Printer, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  printQrLabelSheet,
  QrLabelPrintSheet,
  type QrPrintLabel,
} from "@/components/labels/qr-label-print-sheet";
import { AsyncProductSelect } from "@/components/ui/async-product-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { LABEL_PRINT_FORMATS, type LabelPrintFormat } from "@/lib/label-printing";

import { toPointOfSaleProduct, type PointOfSaleProduct } from "./sell-panel";

type LabelProduct = Pick<PointOfSaleProduct, "id" | "name" | "sku" | "images">;

interface LabelBatch {
  product: LabelProduct;
  copies: number;
}

export function LabelsPanel() {
  const { toast } = useToast();
  const [labelProduct, setLabelProduct] = useState<LabelProduct | null>(null);
  const [labelCopies, setLabelCopies] = useState(1);
  const [batches, setBatches] = useState<LabelBatch[]>([]);
  const [labelPrintFormat, setLabelPrintFormat] = useState<LabelPrintFormat>("COMPACT_65");

  const printableLabels = useMemo<QrPrintLabel[]>(
    () =>
      batches.flatMap((batch) =>
        Array.from({ length: batch.copies }, () => ({
          id: batch.product.id,
          code: `PDP:${batch.product.id}`,
          title: batch.product.name,
          subtitle: `SKU: ${batch.product.sku}`,
        })),
      ),
    [batches],
  );
  const totalLabels = printableLabels.length;

  function addLabels() {
    if (!labelProduct) {
      toast({ title: "Selecciona un producto", variant: "destructive" });
      return;
    }
    const product = labelProduct;
    setBatches((current) => {
      const existing = current.find((batch) => batch.product.id === product.id);
      if (existing) {
        return current.map((batch) =>
          batch.product.id === product.id
            ? { ...batch, copies: batch.copies + labelCopies }
            : batch,
        );
      }
      return [...current, { product, copies: labelCopies }];
    });
    toast({
      title: "Etiquetas listas",
      description: `${labelCopies} etiqueta${labelCopies === 1 ? "" : "s"} de ${product.name} en la hoja.`,
      variant: "success",
    });
  }

  function print() {
    if (!printQrLabelSheet("product")) {
      toast({
        title: "No se pudo abrir la impresión",
        description: "Permite las ventanas emergentes e inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
      <SectionCard
        id="etiquetas-productos"
        title="Etiquetas de productos"
        description="Una etiqueta se reutiliza: pégala en la caja o exhibidor del producto y escanéala cada vez que lo vendas. Las cápsulas sorpresa usan su propio QR desde Ferias."
      >
          <div className="grid gap-2">
            <Label>Producto</Label>
            <AsyncProductSelect
              value={labelProduct?.id ?? ""}
              onChange={(_value, product) => {
                if (product) setLabelProduct(toPointOfSaleProduct(product));
              }}
              placeholder="Busca el producto para etiquetar"
              modal
              ariaLabel="Producto para imprimir etiquetas"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="label-copies">Cantidad</Label>
              <StockQuantityInput
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
                onValueChange={(value) => setLabelPrintFormat(value as LabelPrintFormat)}
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
            <Button type="button" variant="outline" onClick={addLabels} disabled={!labelProduct}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Agregar a la hoja
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {LABEL_PRINT_FORMATS[labelPrintFormat].description}. Hoja adhesiva A4 para inkjet, escala 100%, sin «ajustar a página».
          </p>
      </SectionCard>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
        <SectionCard
          id="etiquetas-hoja"
          title="Hoja para imprimir"
          description={
            totalLabels === 0
              ? "Agrega productos para armar la hoja."
              : LABEL_PRINT_FORMATS[labelPrintFormat].name
          }
          action={
            totalLabels > 0 ? (
              <TintBadge tone="sky" label={`${totalLabels} etiqueta${totalLabels === 1 ? "" : "s"}`} />
            ) : undefined
          }
        >
            {batches.length > 0 && (
              <ul className="divide-y text-sm">
                {batches.map((batch) => (
                  <li key={batch.product.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 truncate">{batch.product.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">× {batch.copies}</span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Quitar etiquetas de ${batch.product.name}`}
                      onClick={() =>
                        setBatches((current) => current.filter((item) => item.product.id !== batch.product.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" className="w-full" disabled={totalLabels === 0} onClick={print}>
              <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
              Imprimir etiquetas
            </Button>
            {batches.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setBatches([])}
              >
                Vaciar la hoja
              </Button>
            )}
        </SectionCard>
      </aside>

      {totalLabels > 0 && (
        <QrLabelPrintSheet target="product" labels={printableLabels} format={labelPrintFormat} />
      )}
    </div>
  );
}
