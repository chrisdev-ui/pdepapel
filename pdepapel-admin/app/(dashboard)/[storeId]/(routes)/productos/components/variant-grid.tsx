"use client";

import type { SupplierPickerOption } from "@/lib/public-catalog";
import { useCanWrite } from "@/components/shell/viewer-access";
import { Supplier } from "@prisma/client";
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Package,
  Pencil,
  Star,
  Trash,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { UseFormReturn } from "react-hook-form";

import { VariantEditModal } from "@/components/modals/variant-edit-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, currencyFormatter } from "@/lib/utils";
import { resolveVariantImages } from "@/lib/variant-images";
import { ProductTintBadge } from "./product-badges";
import type { FormVariant, ProductGroupFormValues } from "./product-group-form";

interface VariantGridProps {
  form: UseFormReturn<ProductGroupFormValues>;
  loading: boolean;
  images: { url: string }[];
  imageScopes: Record<string, string>;
  suppliers: SupplierPickerOption[];
  storeId: string;
  storeUrl?: string | null;
  isEditMode?: boolean;
  onBatchIntake?: (variantIds: string[]) => void;
  sizes: { id: string; name: string; value: string }[];
  colors: { id: string; name: string; value: string }[];
  designs: { id: string; name: string }[];
  /** Variante a resaltar y traer a la vista (llegada desde «Escanear y abrir» en Productos). */
  highlightId?: string | null;
}

type Row = FormVariant & { originalIndex: number };

/** Qué pasa con la fila al guardar. */
function originOf(variant: FormVariant) {
  if (!variant.id) return { label: "Se crea · 0 und", tone: "lavender" };
  if (variant.origin === "adopted") return { label: "Se adopta", tone: "mint" };
  return { label: "Guardada", tone: "slate" };
}

/** Estado en la tienda, por fila: a la venta, archivada o todavía sin crear. */
function statusOf(variant: FormVariant) {
  if (!variant.id) return { label: "Borrador", tone: "slate" };
  if (variant.isArchived) return { label: "Archivada", tone: "cream" };
  return { label: "A la venta", tone: "mint" };
}

/**
 * GTIN con estado local: escribir en la tabla no reescribe el formulario en
 * cada tecla (antes cada pulsación re-renderizaba las 2.500 líneas del
 * formulario); se confirma al salir del campo.
 */
const GtinCell = memo(function GtinCell({
  variant,
  disabled,
  onCommit,
  onNoIdentifier,
}: {
  variant: FormVariant;
  disabled: boolean;
  onCommit: (gtin: string) => void;
  onNoIdentifier: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState(variant.gtin ?? "");
  const noIdentifier = variant.hasNoProductIdentifier === true;
  return (
    <div className="flex min-w-[8rem] flex-col gap-1">
      <Input
        value={noIdentifier ? "" : draft}
        disabled={disabled || noIdentifier}
        inputMode="numeric"
        placeholder={noIdentifier ? "Sin código" : "GTIN real"}
        aria-label={`GTIN de ${variant.name || "la variante"}`}
        className="h-8 font-mono text-xs"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== (variant.gtin ?? "")) onCommit(draft.trim());
        }}
      />
      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
        <Checkbox
          checked={noIdentifier}
          disabled={disabled}
          aria-label={`${variant.name || "La variante"} no tiene código de barras`}
          onCheckedChange={(checked) => {
            const value = checked === true;
            if (value) setDraft("");
            onNoIdentifier(value);
          }}
        />
        Sin código
      </label>
    </div>
  );
});

interface RowHandlers {
  onToggleSelect: (index: number) => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onToggleArchive: (index: number) => void;
  onGtin: (index: number, gtin: string) => void;
  onNoIdentifier: (index: number, value: boolean) => void;
}

function VariantThumb({ urls, name }: { urls: string[]; name: string }) {
  if (urls.length === 0) {
    return <div className="h-12 w-12 shrink-0 rounded-md border bg-muted" aria-hidden="true" />;
  }
  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border">
      <Image src={urls[0]} alt={`Foto de ${name}`} fill sizes="48px" className="object-cover" />
      {urls.length > 1 && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[10px] font-bold text-white">
          +{urls.length - 1}
        </span>
      )}
    </div>
  );
}

function VariantIdentity({
  variant,
  storeId,
  storeUrl,
  withStatus = false,
}: {
  variant: FormVariant;
  storeId: string;
  storeUrl?: string | null;
  /** La tabla no tiene columna de estado; la tarjeta lo pinta en su cabecera. */
  withStatus?: boolean;
}) {
  const attrs = [variant.size?.name, variant.color?.name, variant.design?.name]
    .filter(Boolean)
    .join(" / ");
  const origin = originOf(variant);
  const status = statusOf(variant);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {variant.id ? (
          <Link
            href={`/${storeId}/productos/${variant.id}`}
            className="truncate text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            {variant.name || "Variante"}
          </Link>
        ) : (
          <span className="truncate text-sm font-semibold text-primary">
            {variant.name || "Variante"}
          </span>
        )}
        <ProductTintBadge label={origin.label} tone={origin.tone} />
        {withStatus && variant.id && <ProductTintBadge label={status.label} tone={status.tone} />}
        {variant.isFeatured && (
          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" aria-label="Destacada" />
        )}
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">
        {variant.sku || "SKU al guardar"}
        {attrs ? ` · ${attrs}` : ""}
      </span>
      {variant.slug && (
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          <span className="truncate">/producto/{variant.slug}</span>
          {storeUrl && !variant.isArchived && (
            <a
              href={`${storeUrl}/producto/${variant.slug}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Ver ${variant.name || "la variante"} en la tienda`}
              className="text-primary"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </span>
      )}
    </div>
  );
}

const VariantTableRow = memo(function VariantTableRow({
  row,
  selected,
  highlighted = false,
  loading,
  thumbs,
  supplierName,
  storeId,
  storeUrl,
  handlers,
}: {
  row: Row;
  selected: boolean;
  highlighted?: boolean;
  loading: boolean;
  thumbs: string[];
  supplierName: string;
  storeId: string;
  storeUrl?: string | null;
  handlers: RowHandlers;
}) {
  const canWrite = useCanWrite();
  const index = row.originalIndex;
  return (
    <TableRow
      data-variant-id={row.id ?? undefined}
      data-highlighted={highlighted ? "" : undefined}
      className={cn(!row.id && "bg-tint-lavender/10", row.isArchived && "bg-muted/40", highlighted && "bg-tint-lavender/30 ring-2 ring-inset ring-primary")}
    >
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={() => handlers.onToggleSelect(index)}
          aria-label={`Seleccionar ${row.name || "la variante"}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-start gap-3">
          <VariantThumb urls={thumbs} name={row.name || "la variante"} />
          <VariantIdentity variant={row} storeId={storeId} storeUrl={storeUrl} withStatus />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{currencyFormatter(row.price || 0)}</span>
          <span className="text-xs text-muted-foreground">costo {currencyFormatter(row.acqPrice || 0)}</span>
          <span className="truncate text-xs text-muted-foreground" title={supplierName}>
            {supplierName}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-sm">
        {row.id ? (
          <span className="font-medium">{row.stock || 0} und</span>
        ) : (
          <span className="text-xs text-muted-foreground">0 · por Inventario</span>
        )}
      </TableCell>
      <TableCell>
        <GtinCell
          variant={row}
          disabled={loading}
          onCommit={(gtin) => handlers.onGtin(index, gtin)}
          onNoIdentifier={(value) => handlers.onNoIdentifier(index, value)}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-0.5">
          {canWrite && (
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            disabled={loading}
            aria-label={`Editar ${row.name || "la variante"}`}
            onClick={() => handlers.onEdit(index)}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          )}
          {row.id && (
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              disabled={loading}
              aria-label={`${row.isArchived ? "Publicar" : "Archivar"} ${row.name || "la variante"}`}
              title={row.isArchived ? "Publicar" : "Archivar"}
              onClick={() => handlers.onToggleArchive(index)}
            >
              {row.isArchived ? (
                <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Archive className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            disabled={loading}
            aria-label={`Quitar ${row.name || "la variante"} del grupo`}
            onClick={() => handlers.onRemove(index)}
          >
            <Trash className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

const VariantCard = memo(function VariantCard({
  row,
  selected,
  highlighted = false,
  loading,
  thumbs,
  supplierName,
  storeId,
  storeUrl,
  handlers,
}: {
  row: Row;
  selected: boolean;
  highlighted?: boolean;
  loading: boolean;
  thumbs: string[];
  supplierName: string;
  storeId: string;
  storeUrl?: string | null;
  handlers: RowHandlers;
}) {
  const canWrite = useCanWrite();
  const index = row.originalIndex;
  const status = statusOf(row);
  return (
    <article
      data-variant-id={row.id ?? undefined}
      data-highlighted={highlighted ? "" : undefined}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm",
        selected && "border-primary bg-accent/40",
        row.isArchived && "bg-muted/30",
        highlighted && "border-primary bg-tint-lavender/30 ring-2 ring-primary",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-1"
          checked={selected}
          onCheckedChange={() => handlers.onToggleSelect(index)}
          aria-label={`Seleccionar ${row.name || "la variante"}`}
        />
        <VariantThumb urls={thumbs} name={row.name || "la variante"} />
        <div className="min-w-0 flex-1">
          <VariantIdentity variant={row} storeId={storeId} storeUrl={storeUrl} />
        </div>
        <ProductTintBadge label={status.label} tone={status.tone} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{currencyFormatter(row.price || 0)}</span>
        <span className="text-xs text-muted-foreground">costo {currencyFormatter(row.acqPrice || 0)}</span>
        {row.id ? (
          <span className="text-xs">{row.stock || 0} und</span>
        ) : (
          <span className="text-xs text-muted-foreground">0 · por Inventario</span>
        )}
        <span className="text-xs text-muted-foreground">{supplierName}</span>
      </div>
      <GtinCell
        variant={row}
        disabled={loading}
        onCommit={(gtin) => handlers.onGtin(index, gtin)}
        onNoIdentifier={(value) => handlers.onNoIdentifier(index, value)}
      />
      <div className="flex flex-wrap gap-2">
        {canWrite && (
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => handlers.onEdit(index)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Editar
          </Button>
        )}
        {row.id && (
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => handlers.onToggleArchive(index)}>
            {row.isArchived ? (
              <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Archive className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            {row.isArchived ? "Publicar" : "Archivar"}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={loading}
          className="ml-auto text-destructive"
          onClick={() => handlers.onRemove(index)}
        >
          <Trash className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Quitar
        </Button>
      </div>
    </article>
  );
});

export const VariantGrid: React.FC<VariantGridProps> = ({
  form,
  loading,
  images,
  imageScopes,
  suppliers,
  storeId,
  storeUrl,
  isEditMode = false,
  onBatchIntake,
  sizes,
  colors,
  designs,
  highlightId = null,
}) => {
  const canWrite = useCanWrite();
  const { watch, setValue, getValues } = form;
  // La variante escaneada en Productos se trae a la vista una vez; el resalte se queda.
  useEffect(() => {
    if (!highlightId || typeof document === "undefined") return;
    // Tras pintar: con fotos y barra fija cargando, un scroll inmediato se queda corto.
    const timer = setTimeout(() => {
      // La fila existe dos veces (tarjeta hasta 1279 px, fila de tabla desde ahí): se desplaza a la visible.
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-variant-id="${highlightId}"][data-highlighted]`));
      const target = candidates.find((el) => el.getBoundingClientRect().width > 0) ?? candidates[0];
      target?.scrollIntoView?.({ block: "center" });
    }, 350);
    return () => clearTimeout(timer);
  }, [highlightId]);
  const watchedVariants = watch("variants");
  const formVariants = useMemo(() => watchedVariants ?? [], [watchedVariants]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const supplierNames = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers],
  );
  const mapping = useMemo(
    () => Object.entries(imageScopes).map(([url, scope]) => ({ url, scope })),
    [imageScopes],
  );

  const rows: Row[] = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return formVariants
      .map((variant, index) => ({ ...variant, originalIndex: index }))
      .filter(
        (variant) =>
          !term ||
          variant.sku?.toLowerCase().includes(term) ||
          variant.name?.toLowerCase().includes(term) ||
          variant.gtin?.includes(term),
      );
  }, [formVariants, searchTerm]);

  const thumbsFor = useCallback(
    (variant: FormVariant) =>
      variant.images && variant.images.length > 0
        ? variant.images
        : resolveVariantImages({
            groupImages: images,
            imageMapping: mapping,
            colorId: variant.color?.id,
            designId: variant.design?.id,
          }).map((image) => image.url),
    [images, mapping],
  );

  const updateRow = useCallback(
    (index: number, patch: Partial<FormVariant>) => {
      const current = getValues("variants") ?? [];
      setValue(`variants.${index}`, { ...current[index], ...patch }, { shouldDirty: true });
    },
    [getValues, setValue],
  );

  const handlers: RowHandlers = useMemo(
    () => ({
      onToggleSelect: (index) =>
        setSelectedIndices((prev) => {
          const next = new Set(prev);
          if (next.has(index)) next.delete(index);
          else next.add(index);
          return next;
        }),
      onEdit: (index) => setEditingIndex(index),
      onRemove: (index) => {
        const current = getValues("variants") ?? [];
        setValue(
          "variants",
          current.filter((_, i) => i !== index),
          { shouldDirty: true, shouldTouch: true, shouldValidate: true },
        );
        setSelectedIndices(new Set());
      },
      onToggleArchive: (index) => {
        const current = getValues("variants") ?? [];
        updateRow(index, { isArchived: !current[index]?.isArchived });
      },
      onGtin: (index, gtin) => updateRow(index, { gtin }),
      onNoIdentifier: (index, value) =>
        updateRow(index, { hasNoProductIdentifier: value, ...(value ? { gtin: "" } : {}) }),
    }),
    [getValues, setValue, updateRow],
  );

  const toggleSelectAll = () => {
    if (selectedIndices.size === rows.length) setSelectedIndices(new Set());
    else setSelectedIndices(new Set(rows.map((row) => row.originalIndex)));
  };

  const bulk = (patch: (variant: FormVariant) => FormVariant) => {
    const current = getValues("variants") ?? [];
    setValue(
      "variants",
      current.map((variant, index) => (selectedIndices.has(index) ? patch(variant) : variant)),
      { shouldDirty: true, shouldTouch: true, shouldValidate: true },
    );
    setSelectedIndices(new Set());
  };

  const onSaveVariant = (data: Partial<FormVariant>) => {
    if (editingIndex === null) return;
    // Se mezcla sobre la fila: lo que el modal no conoce se conserva.
    updateRow(editingIndex, data);
    setEditingIndex(null);
  };

  const editingVariant = editingIndex !== null ? formVariants[editingIndex] : null;
  const selectedSaved = Array.from(selectedIndices)
    .map((index) => formVariants[index])
    .filter((variant): variant is FormVariant => Boolean(variant?.id));

  return (
    <>
      <VariantEditModal
        isOpen={editingIndex !== null}
        onClose={() => setEditingIndex(null)}
        onConfirm={onSaveVariant}
        initialData={
          editingVariant ? { ...editingVariant, images: thumbsFor(editingVariant) } : null
        }
        suppliers={suppliers}
        groupImages={images}
        sizes={sizes}
        colors={colors}
        designs={designs}
      />

      {formVariants.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Este grupo todavía no tiene variantes. Usa «Traer productos existentes»
          para adoptar productos sueltos o «Generar combinaciones» para crear
          variantes nuevas (nacen con 0 unidades).
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder="Buscar por nombre, SKU o GTIN"
              aria-label="Buscar variante"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="sm:max-w-xs"
            />
            <span className="text-xs text-muted-foreground sm:ml-auto">
              {rows.length} de {formVariants.length}{" "}
              {formVariants.length === 1 ? "variante" : "variantes"}
            </span>
          </div>

          {selectedIndices.size > 0 && (
            <div
              role="region"
              aria-label={`${selectedIndices.size} variantes seleccionadas`}
              className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-2"
            >
              <span className="px-1 text-xs font-semibold text-primary">
                {selectedIndices.size} {selectedIndices.size === 1 ? "seleccionada" : "seleccionadas"}
              </span>
              {isEditMode && onBatchIntake && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={selectedSaved.length === 0}
                  onClick={() => onBatchIntake(selectedSaved.map((variant) => variant.id!))}
                >
                  <Package className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Ingresar stock ({selectedSaved.length})
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={selectedSaved.length === 0}
                onClick={() => bulk((variant) => (variant.id ? { ...variant, isArchived: true } : variant))}
              >
                <Archive className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Archivar ({selectedSaved.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={selectedSaved.length === 0}
                onClick={() => bulk((variant) => (variant.id ? { ...variant, isArchived: false } : variant))}
              >
                <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Publicar ({selectedSaved.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  const current = getValues("variants") ?? [];
                  setValue(
                    "variants",
                    current.filter((_, index) => !selectedIndices.has(index)),
                    { shouldDirty: true, shouldTouch: true, shouldValidate: true },
                  );
                  setSelectedIndices(new Set());
                }}
              >
                <Trash className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Quitar ({selectedIndices.size})
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIndices(new Set())}>
                Quitar selección
              </Button>
            </div>
          )}

          {/* Hasta 1279 px: tarjetas. Junto al panel lateral la tabla no cabe
              sin scroll anidado por debajo de ese ancho. */}
          <div className="flex flex-col gap-2 xl:hidden">
            {rows.map((row) => (
              <VariantCard
                key={row.id ?? `new-${row.originalIndex}`}
                row={row}
                selected={selectedIndices.has(row.originalIndex)}
                highlighted={Boolean(highlightId) && row.id === highlightId}
                loading={loading}
                thumbs={thumbsFor(row)}
                supplierName={supplierNames.get(row.supplierId ?? "") ?? "Sin proveedor"}
                storeId={storeId}
                storeUrl={storeUrl}
                handlers={handlers}
              />
            ))}
          </div>

          {/* Escritorio ancho: tabla compacta de columnas fijas. Con el
              reparto automático, un texto sin cortes (la URL con `truncate`)
              ensanchaba la tabla más que su tarjeta y recortaba «Acciones»
              (751 px en 740 px en producción); con `table-fixed` el ancho lo
              manda el contenedor y `truncate` sí recorta. Por debajo de 46 rem
              desplaza en horizontal en vez de aplastar «Variante». */}
          <div className="hidden overflow-x-auto rounded-xl border xl:block">
            <Table className="table-fixed min-w-[46rem] [&_td]:px-2 [&_th]:px-2">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={rows.length > 0 && selectedIndices.size === rows.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Seleccionar todas las variantes"
                    />
                  </TableHead>
                  <TableHead>Variante</TableHead>
                  <TableHead className="w-28">Precio · costo</TableHead>
                  <TableHead className="w-16">Stock</TableHead>
                  <TableHead className="w-36">GTIN</TableHead>
                  <TableHead className="w-28 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <VariantTableRow
                    key={row.id ?? `new-${row.originalIndex}`}
                    row={row}
                    selected={selectedIndices.has(row.originalIndex)}
                    highlighted={Boolean(highlightId) && row.id === highlightId}
                    loading={loading}
                    thumbs={thumbsFor(row)}
                    supplierName={supplierNames.get(row.supplierId ?? "") ?? "Sin proveedor"}
                    storeId={storeId}
                    storeUrl={storeUrl}
                    handlers={handlers}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
};
