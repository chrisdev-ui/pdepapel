"use client";

import axios from "axios";
import { Boxes, Coins, Package, Plus, Trash2, Undo2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Textarea } from "@/components/ui/textarea";
import { currencyFormatter } from "@/lib/utils";

import { TintBadge } from "../../../pedidos/components/order-badges";
import type {
  CapsuleBatchRow,
  CapsuleProductOption,
  SourceProductOption,
} from "../server/get-capsule-workspace";

interface CapsulePackerProps {
  capsuleProducts: CapsuleProductOption[];
  sourceProducts: SourceProductOption[];
  batches: CapsuleBatchRow[];
}

interface DraftLine {
  productId: string;
  quantity: number;
}

/**
 * Empacar cápsulas: qué entra, cuántas salen y cuánto cuesta cada una.
 *
 * La cuenta se hace a la vista mientras se arma el lote, porque el costo por
 * cápsula es lo único que decide si el precio de venta tiene margen, y
 * descubrirlo después de empacar no sirve de nada.
 */
export function CapsulePacker({
  capsuleProducts,
  sourceProducts,
  batches,
}: CapsulePackerProps) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [capsuleProductId, setCapsuleProductId] = useState<string | null>(
    capsuleProducts[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState(10);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);

  const sourcesById = useMemo(
    () => new Map(sourceProducts.map((product) => [product.id, product])),
    [sourceProducts],
  );
  const capsule = capsuleProducts.find((item) => item.id === capsuleProductId);

  const totalCost = lines.reduce((total, line) => {
    const product = sourcesById.get(line.productId);
    return total + (product ? product.acqPrice * line.quantity : 0);
  }, 0);
  const totalUnits = lines.reduce((total, line) => total + line.quantity, 0);
  const unitCost = quantity > 0 ? totalCost / quantity : 0;
  const margin =
    capsule && capsule.price > 0
      ? ((capsule.price - unitCost) / capsule.price) * 100
      : null;

  const missingCost = lines.filter(
    (line) => (sourcesById.get(line.productId)?.acqPrice ?? 0) <= 0,
  );
  const overStock = lines.filter(
    (line) => line.quantity > (sourcesById.get(line.productId)?.stock ?? 0),
  );
  const canSave =
    !isSaving &&
    Boolean(capsuleProductId) &&
    quantity > 0 &&
    lines.length > 0 &&
    missingCost.length === 0 &&
    overStock.length === 0;

  const options = useMemo(
    () =>
      sourceProducts
        .filter((product) => !lines.some((line) => line.productId === product.id))
        .map((product) => ({
          value: product.id,
          label: product.name,
          description: `SKU ${product.sku} · ${product.stock} en bodega · costo ${currencyFormatter(product.acqPrice)}`,
          keywords: [product.sku],
        })),
    [sourceProducts, lines],
  );

  const addLine = (productId: string | null) => {
    if (!productId) return;
    setLines((current) => [...current, { productId, quantity: 1 }]);
  };

  const onSubmit = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await axios.post(`/api/${params.storeId}/capsule-batches`, {
        capsuleProductId,
        quantity,
        sources: lines,
        notes: notes.trim() || null,
      });
      toast({ title: `${quantity} cápsulas empacadas` });
      setLines([]);
      setNotes("");
      router.refresh();
    } catch (error: any) {
      toast({
        title: error?.response?.data?.message ?? "No se pudo empacar el lote",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const onUnpack = async (batchId: string) => {
    setUndoing(batchId);
    try {
      await axios.delete(`/api/${params.storeId}/capsule-batches/${batchId}`);
      toast({ title: "El lote volvió a ser sus productos" });
      router.refresh();
    } catch (error: any) {
      toast({
        title: error?.response?.data?.message ?? "No se pudo deshacer el lote",
        variant: "destructive",
      });
    } finally {
      setUndoing(null);
    }
  };

  if (capsuleProducts.length === 0) {
    return (
      <SectionCard
        id="sin-capsulas"
        title="Todavía no hay un producto cápsula"
        description="Una cápsula es un producto normal en la categoría «Kits sorpresa». Créalo en Productos y vuelve aquí para empacar el primer lote."
        tone="care"
      >
        <p className="text-sm text-muted-foreground">
          Ponle precio de venta y déjalo sin stock: el stock lo pone el lote que
          empaques aquí.
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        id="lote"
        step={1}
        title="Qué cápsula y cuántas"
        description="El stock del producto cápsula sube en esta cantidad al guardar."
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <div className="grid gap-1.5">
            <Label htmlFor="capsula">Producto cápsula</Label>
            <Combobox
              id="capsula"
              options={capsuleProducts.map((product) => ({
                value: product.id,
                label: product.name,
                description: `SKU ${product.sku} · ${product.stock} empacadas · se vende a ${currencyFormatter(product.price)}`,
                keywords: [product.sku],
              }))}
              value={capsuleProductId}
              onChange={setCapsuleProductId}
              placeholder="Elige la cápsula"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cantidad">Cápsulas que salen</Label>
            <StockQuantityInput
              id="cantidad"
              min={1}
              value={quantity}
              onChange={setQuantity}
              ariaLabel="Cápsulas que produce el lote"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        id="contenido"
        step={2}
        title="Qué entra en el lote"
        description="Estas unidades salen de bodega al guardar; el costo de cada cápsula sale de aquí."
      >
        <div className="flex flex-col gap-3">
          <Combobox
            options={options}
            value={null}
            onChange={addLine}
            placeholder="Busca un producto por nombre o SKU"
            emptyText="No quedan productos con stock por agregar"
            aria-label="Agregar un producto al lote"
          />

          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Todavía no has agregado nada. Busca arriba el primer producto.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line) => {
                const product = sourcesById.get(line.productId);
                if (!product) return null;
                const tooMany = line.quantity > product.stock;
                const noCost = product.acqPrice <= 0;
                return (
                  <li
                    key={line.productId}
                    className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_128px_110px_40px] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        SKU {product.sku} · {product.stock} en bodega ·{" "}
                        {noCost ? (
                          <span className="font-semibold text-destructive">
                            sin costo registrado
                          </span>
                        ) : (
                          `costo ${currencyFormatter(product.acqPrice)}`
                        )}
                      </p>
                    </div>
                    <StockQuantityInput
                      size="sm"
                      min={1}
                      value={line.quantity}
                      onChange={(value) =>
                        setLines((current) =>
                          current.map((item) =>
                            item.productId === line.productId
                              ? { ...item, quantity: value }
                              : item,
                          ),
                        )
                      }
                      ariaLabel={`Unidades de ${product.name} en el lote`}
                    />
                    <p className="text-sm tabular-nums sm:text-right">
                      {tooMany ? (
                        <TintBadge tone="pink" label={`Solo hay ${product.stock}`} />
                      ) : (
                        currencyFormatter(product.acqPrice * line.quantity)
                      )}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((item) => item.productId !== line.productId),
                        )
                      }
                      aria-label={`Quitar ${product.name} del lote`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard
          label="Unidades que entran"
          value={totalUnits.toLocaleString("es-CO")}
          note="Salen de bodega al guardar"
          icon={<Package className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-sky"
        />
        <MetricCard
          label="Costo del lote"
          value={currencyFormatter(totalCost)}
          note="Suma de lo que entra"
          icon={<Coins className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-cream"
        />
        <MetricCard
          label="Costo por cápsula"
          value={currencyFormatter(unitCost)}
          note="Se congela en el lote"
          icon={<Boxes className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-lavender"
        />
        <MetricCard
          label="Margen de venta"
          value={margin === null ? "—" : `${margin.toFixed(1)} %`}
          note={
            capsule
              ? `Se vende a ${currencyFormatter(capsule.price)}`
              : "Elige la cápsula"
          }
          icon={<Coins className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-mint"
          tone={margin !== null && margin < 20 ? "care" : "default"}
        />
      </div>

      <SectionCard
        id="nota"
        step={3}
        title="Nota del lote"
        description="Opcional. Queda guardada con el lote, por si hay que explicarlo después."
      >
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Por ejemplo: lote para la feria de octubre"
          rows={2}
        />
      </SectionCard>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {missingCost.length > 0 && (
          <p className="text-xs text-destructive sm:mr-auto">
            Hay productos sin costo registrado: sin eso no se puede saber cuánto
            cuesta la cápsula.
          </p>
        )}
        {missingCost.length === 0 && overStock.length > 0 && (
          <p className="text-xs text-destructive sm:mr-auto">
            Hay líneas que piden más unidades de las que hay en bodega.
          </p>
        )}
        <Button type="button" onClick={onSubmit} disabled={!canSave}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {isSaving ? "Empacando…" : `Empacar ${quantity} cápsulas`}
        </Button>
      </div>

      <SectionCard
        id="historial"
        title="Lotes empacados"
        description="Un lote se puede deshacer mientras no se haya vendido ninguna de sus cápsulas."
      >
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay lotes.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {batches.map((batch) => {
              const sold = batch.quantity - batch.capsuleStock;
              const canUndo = !batch.unpackedAt && batch.capsuleStock >= batch.quantity;
              return (
                <li
                  key={batch.id}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {batch.quantity} × {batch.capsuleName}{" "}
                      {batch.unpackedAt ? (
                        <TintBadge tone="slate" label="Deshecho" />
                      ) : sold > 0 ? (
                        <TintBadge tone="mint" label={`${sold} vendidas`} />
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(batch.createdAt).toLocaleDateString("es-CO")} ·{" "}
                      {currencyFormatter(batch.unitCost)} por cápsula ·{" "}
                      {batch.items.length} producto
                      {batch.items.length === 1 ? "" : "s"}:{" "}
                      {batch.items
                        .map((item) => `${item.quantity}× ${item.name}`)
                        .join(" · ")}
                    </p>
                  </div>
                  {canUndo && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={undoing === batch.id}
                      onClick={() => onUnpack(batch.id)}
                    >
                      <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Deshacer
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
