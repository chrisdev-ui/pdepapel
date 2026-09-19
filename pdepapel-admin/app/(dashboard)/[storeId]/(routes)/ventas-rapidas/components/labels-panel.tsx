"use client";

import axios from "axios";
import { Layers, Minus, Plus, Printer, Ruler, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LabelSheetPreview } from "@/components/labels/label-sheet-preview";
import { PrintOffsetFields } from "@/components/labels/print-offset-fields";
import {
  labelPrintUrl,
  openLabelPrintJob,
  type QrPrintLabel,
} from "@/components/labels/qr-label-print-sheet";
import { AsyncProductSelect, type AsyncProductOption } from "@/components/ui/async-product-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getLabelSheetTemplate, labelsPerSheet, paginateLabels } from "@/lib/label-printing";
import {
  addToDraft,
  describeVariant,
  draftLabelCount,
  EMPTY_LABEL_DRAFT,
  labelDraftStorageKey,
  MAX_COPIES_PER_PRODUCT,
  parseLabelDraft,
  removeFromDraft,
  serializeLabelDraft,
  setDraftCopies,
  type LabelDraftProduct,
  type LabelSheetDraft,
} from "@/lib/label-sheet-draft";
import { getErrorMessage } from "@/lib/api-errors";

function toDraftProduct(product: AsyncProductOption): LabelDraftProduct {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: typeof product.price === "number" ? product.price : null,
    variant: describeVariant(product),
    imageUrl: product.images?.[0]?.url ?? null,
    productGroupId: product.productGroupId ?? null,
  };
}

/**
 * La hoja se guarda en el navegador: cambiar a «Vender» ya no la vacía. Se
 * escribe sólo después de leer (`hydrated` es estado, no un ref: con el doble
 * montaje de React en desarrollo un ref ya marcado dejaba escribir la hoja
 * vacía encima de la guardada antes de que llegara la lectura).
 */
function useLabelDraft(storeId: string) {
  const [draft, setDraft] = useState<LabelSheetDraft>(EMPTY_LABEL_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      setDraft(parseLabelDraft(window.localStorage.getItem(labelDraftStorageKey(storeId))));
    } catch {
      setDraft(EMPTY_LABEL_DRAFT);
    }
    setHydrated(true);
  }, [storeId]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(labelDraftStorageKey(storeId), serializeLabelDraft(draft));
    } catch {
      // Sin almacenamiento (modo privado): la hoja vive solo en memoria.
    }
  }, [draft, hydrated, storeId]);
  return [draft, setDraft] as const;
}

export function LabelsPanel() {
  const params = useParams();
  const storeId = String(params.storeId);
  const { toast } = useToast();
  const [draft, setDraft] = useLabelDraft(storeId);
  const [picked, setPicked] = useState<AsyncProductOption | null>(null);
  const [copies, setCopies] = useState(1);
  const [addingGroup, setAddingGroup] = useState(false);

  const template = getLabelSheetTemplate(draft.templateId);
  const perSheet = labelsPerSheet(template);

  const labels = useMemo<QrPrintLabel[]>(
    () =>
      draft.batches.flatMap((batch) =>
        Array.from({ length: batch.copies }, () => ({
          id: batch.product.id,
          code: `PDP:${batch.product.id}`,
          title: batch.product.name,
          variant: batch.product.variant,
          sku: batch.product.sku,
          price: batch.product.price,
        })),
      ),
    [draft.batches],
  );
  const total = draftLabelCount(draft);
  const pagination = useMemo(() => paginateLabels(labels, template, draft.startAt), [labels, template, draft.startAt]);

  const addProduct = useCallback(
    (product: LabelDraftProduct, count: number) => {
      setDraft((current) => addToDraft(current, product, count));
    },
    [setDraft],
  );

  function onAdd() {
    if (!picked) {
      toast({ title: "Elige un producto primero", variant: "destructive" });
      return;
    }
    addProduct(toDraftProduct(picked), copies);
    toast({
      title: "En la hoja",
      description: `${copies} ${copies === 1 ? "etiqueta" : "etiquetas"} de ${picked.name}.`,
      variant: "success",
    });
  }

  async function onAddGroup() {
    if (!picked?.productGroupId) return;
    setAddingGroup(true);
    try {
      const response = await axios.get(`/api/${storeId}/product-groups/${picked.productGroupId}`);
      const products: AsyncProductOption[] = (response.data?.products ?? []).filter(
        (product: AsyncProductOption & { isArchived?: boolean }) => !product.isArchived,
      );
      if (products.length === 0) throw new Error("El grupo no tiene variantes a la venta.");
      setDraft((current) =>
        products.reduce((acc, product) => addToDraft(acc, toDraftProduct(product), copies), current),
      );
      toast({
        title: "Grupo en la hoja",
        description: `${products.length} ${products.length === 1 ? "variante" : "variantes"} × ${copies}.`,
        variant: "success",
      });
    } catch (error) {
      toast({ title: "No se pudo traer el grupo", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setAddingGroup(false);
    }
  }

  function onPrint() {
    if (total === 0) return;
    const opened = openLabelPrintJob({
      storeId,
      source: "product",
      labels,
      templateId: draft.templateId,
      startAt: draft.startAt,
      sheet: draft.sheet,
      content: draft.content,
      createdAt: new Date().toISOString(),
    });
    if (!opened) {
      toast({
        title: "No se pudo preparar la impresión",
        description: "El navegador no dejó guardar la hoja. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  }

  const contentToggle = (key: keyof LabelSheetDraft["content"], label: string, hint?: string) => (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <Checkbox
        checked={draft.content[key]}
        onCheckedChange={(checked) =>
          setDraft((current) => ({ ...current, content: { ...current.content, [key]: checked === true } }))
        }
        className="mt-0.5"
        aria-label={label}
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-6">
        <SectionCard
          id="etiquetas-productos"
          step={1}
          title="Elige qué etiquetar"
          description="Una etiqueta por producto o variante, reutilizable: pégala en la caja o el exhibidor y escanéala en cada venta. Las cápsulas sorpresa usan su propio QR desde Ferias."
        >
          <div className="grid gap-2">
            <Label>Busca el producto</Label>
            <AsyncProductSelect
              value={picked?.id ?? ""}
              onChange={(_value, product) => setPicked(product ?? null)}
              placeholder="Nombre, SKU o código de barras"
              modal
              ariaLabel="Producto para imprimir etiquetas"
            />
            {picked && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-tint-mint bg-tint-mint/20 px-3 py-2 text-sm">
                <span className="font-semibold text-primary">{picked.name}</span>
                {describeVariant(picked) && <TintBadge tone="lavender" label={describeVariant(picked)!} />}
                <span className="font-mono text-xs text-muted-foreground">{picked.sku}</span>
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="label-copies">Cantidad</Label>
              <StockQuantityInput
                id="label-copies"
                min={1}
                max={MAX_COPIES_PER_PRODUCT}
                value={copies}
                onChange={setCopies}
                ariaLabel="Cantidad de etiquetas"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onAdd} disabled={!picked}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Agregar a la hoja
              </Button>
              {picked?.productGroupId && (
                <Button type="button" variant="outline" onClick={onAddGroup} disabled={addingGroup}>
                  <Layers className="mr-2 h-4 w-4" aria-hidden="true" />
                  Todas las variantes del grupo
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Una por sitio donde guardes el producto; no hace falta una por unidad.
          </p>
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
            {contentToggle("showVariant", "Variante", "Color, tamaño o diseño en su propia línea.")}
            {contentToggle("showSku", "SKU", "Siempre completo: es lo que se escribe si la cámara falla.")}
            {contentToggle("showPrice", "Precio", "Sale de la ficha en el momento de imprimir.")}
          </div>
        </SectionCard>

        <SectionCard
          id="etiquetas-hoja-formato"
          step={2}
          title="Hoja y ajuste"
          description={`${template.name} · ${template.description}. Papel carta, escala 100 % (tamaño real), sin «ajustar a página».`}
          action={
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={labelPrintUrl(storeId, "calibracion")} target="_blank" rel="noreferrer">
                <Ruler className="mr-2 h-4 w-4" aria-hidden="true" />
                Hoja de calibración
              </Link>
            </Button>
          }
        >
          {template.provisional && (
            <p className="rounded-lg border border-tint-cream bg-tint-cream/40 px-3 py-2 text-xs text-primary">
              El margen superior de esta hoja es aproximado (el fabricante no publica la ficha). Imprime la hoja de
              calibración sobre papel normal y ponla detrás de una hoja adhesiva al trasluz; si se corre, ajusta
              «Desplazar impresión» aquí o en la propia página de calibración y vuelve a imprimir.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-1">
              <Label htmlFor="label-start-at">Empezar en la etiqueta nº</Label>
              <Input
                id="label-start-at"
                type="number"
                inputMode="numeric"
                min={1}
                max={perSheet}
                value={draft.startAt}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    startAt: Math.min(Math.max(Math.round(Number(event.target.value) || 1), 1), perSheet),
                  }))
                }
              />
              <span className="text-xs text-muted-foreground">Para aprovechar una hoja a medio usar.</span>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <span className="text-sm font-medium">Desplazar impresión</span>
              <PrintOffsetFields
                value={draft.sheet}
                onChange={(sheet) => setDraft((current) => ({ ...current, sheet }))}
                idPrefix="label-offset"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-3">
              <Checkbox
                checked={draft.sheet.cutGuides}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({ ...current, sheet: { ...current.sheet, cutGuides: checked === true } }))
                }
                className="mt-0.5"
                aria-label="Imprimir guías de corte"
              />
              <span>
                Guías de corte
                <span className="block text-xs text-muted-foreground">
                  Contorno fino y marcas en las esquinas para recortar con tijeras.
                </span>
              </span>
            </label>
          </div>
        </SectionCard>

        <SectionCard
          id="etiquetas-vista"
          step={3}
          title="Así queda la hoja"
          description={
            total === 0
              ? "Agrega productos para ver la hoja."
              : `${total} ${total === 1 ? "etiqueta" : "etiquetas"} · ${pagination.pageCount} ${pagination.pageCount === 1 ? "hoja" : "hojas"} carta${draft.startAt > 1 ? ` · desde la posición ${draft.startAt}` : ""} · ${pagination.freeOnLastPage} ${pagination.freeOnLastPage === 1 ? "posición libre" : "posiciones libres"} en la última.`
          }
        >
          {total > 0 ? (
            <LabelSheetPreview
              labels={labels}
              templateId={draft.templateId}
              startAt={draft.startAt}
              sheet={draft.sheet}
              content={draft.content}
              maxPages={2}
              className="w-full"
            />
          ) : (
            <p className="text-sm text-muted-foreground">La vista previa es la hoja real a escala: lo que ves es lo que sale.</p>
          )}
          {pagination.pageCount > 2 && (
            <p className="text-xs text-muted-foreground">Se muestran las 2 primeras hojas de {pagination.pageCount}.</p>
          )}
        </SectionCard>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
        <SectionCard
          id="etiquetas-hoja"
          title="Hoja para imprimir"
          description={total === 0 ? "Vacía por ahora." : "La hoja se guarda en este navegador."}
          action={total > 0 ? <TintBadge tone="sky" label={`${total} ${total === 1 ? "etiqueta" : "etiquetas"}`} /> : undefined}
        >
          {draft.batches.length > 0 && (
            <ul className="divide-y text-sm">
              {draft.batches.map((batch) => (
                <li key={batch.product.id} className="flex items-center gap-2 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{batch.product.name}</span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {batch.product.sku}
                      {batch.product.variant ? ` · ${batch.product.variant}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center rounded-md border">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Menos etiquetas de ${batch.product.name}`}
                      onClick={() => setDraft((current) => setDraftCopies(current, batch.product.id, batch.copies - 1))}
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <span className="min-w-[1.75rem] text-center text-sm font-semibold" aria-live="polite">
                      {batch.copies}
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Más etiquetas de ${batch.product.name}`}
                      disabled={batch.copies >= MAX_COPIES_PER_PRODUCT}
                      onClick={() => setDraft((current) => setDraftCopies(current, batch.product.id, batch.copies + 1))}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Quitar etiquetas de ${batch.product.name}`}
                    onClick={() => setDraft((current) => removeFromDraft(current, batch.product.id))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" className="w-full" disabled={total === 0} onClick={onPrint}>
            <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
            Imprimir o guardar PDF
          </Button>
          {draft.batches.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setDraft((current) => ({ ...current, batches: [] }))}
            >
              Vaciar la hoja
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Se abre en otra pestaña con el diálogo de impresión. En iPad: Compartir → Imprimir.
          </p>
        </SectionCard>
      </aside>
    </div>
  );
}
