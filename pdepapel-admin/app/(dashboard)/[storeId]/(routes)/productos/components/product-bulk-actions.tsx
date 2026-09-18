"use client";

import {
  Archive,
  ArchiveRestore,
  Barcode,
  CalendarClock,
  CalendarX2,
  Check,
  Download,
  Palette,
  Ruler,
  ScanBarcode,
  Shapes,
  Star,
  StarOff,
  Tag,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Table } from "@tanstack/react-table";
import axios from "axios";

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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DateField } from "@/components/ui/date-field";
import { TintBadge } from "@/components/ui/tint-badge";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { isComingSoon } from "@/lib/product-availability";
import {
  partitionForBulk,
  productsToCsv,
  type ProductBulkAction,
} from "@/lib/product-bulk";
import { productLacksIdentifier } from "@/lib/product-readiness";
import { localDateToPromotionDay } from "@/lib/promotion-window";
import { cn, currencyFormatter } from "@/lib/utils";

import type { ProductColumn } from "./columns";

type BulkField =
  | "isArchived"
  | "isFeatured"
  | "hasNoProductIdentifier"
  | "availableAt"
  | "categoryId"
  | "colorId"
  | "sizeId"
  | "designId";

export interface BulkTaxonomyOption {
  id: string;
  name: string;
  value?: string | null;
}

export interface BulkTaxonomies {
  categories: BulkTaxonomyOption[];
  sizes: BulkTaxonomyOption[];
  colors: BulkTaxonomyOption[];
  designs: BulkTaxonomyOption[];
}

interface PendingAction {
  field: BulkField;
  value: boolean | string | null;
  label: string;
  /** Verbo corto para el título: «Archivar». */
  description: string;
  /** Partición de filas (las de taxonomía aplican a todas). */
  partition?: ProductBulkAction;
  picker?: keyof BulkTaxonomies;
}

const ACTIONS: Array<
  PendingAction & {
    icon: typeof Archive;
    show: (rows: ProductColumn[]) => boolean;
  }
> = [
  {
    field: "isArchived",
    value: true,
    label: "Archivar",
    description:
      "Salen de la tienda y del buscador, y su publicación activa en Mercado Libre se pausa. Conservan pedidos, kardex y URL. Se pueden restaurar.",
    partition: "archive",
    icon: Archive,
    show: (rows) => rows.some((row) => !row.isArchived),
  },
  {
    field: "isArchived",
    value: false,
    label: "Restaurar",
    description:
      "Vuelven a la tienda con su stock y precio actuales. La publicación de Mercado Libre no se reactiva sola.",
    partition: "restore",
    icon: ArchiveRestore,
    show: (rows) => rows.some((row) => row.isArchived),
  },
  {
    field: "isFeatured",
    value: true,
    label: "Destacar",
    description: "Aparecen primero en la portada de la tienda.",
    partition: "feature",
    icon: Star,
    show: (rows) => rows.some((row) => !row.isFeatured),
  },
  {
    field: "isFeatured",
    value: false,
    label: "Quitar destacado",
    description: "Dejan de aparecer en la portada; siguen en su categoría.",
    partition: "unfeature",
    icon: StarOff,
    show: (rows) => rows.some((row) => row.isFeatured),
  },
  {
    field: "hasNoProductIdentifier",
    value: true,
    label: "Marcar sin código",
    description:
      "Solo se marcan los que no tienen GTIN ni MPN; los que ya tienen código se dejan como están. Google Merchant los acepta así. Nunca inventes un GTIN.",
    partition: "mark-no-identifier",
    icon: Barcode,
    show: (rows) => rows.some((row) => productLacksIdentifier(row)),
  },
  {
    field: "hasNoProductIdentifier",
    value: false,
    label: "Quitar marca sin código",
    description:
      "Vuelven a pedir un GTIN real o la marca; úsalo si vas a registrar sus códigos de barras.",
    partition: "unmark-no-identifier",
    icon: ScanBarcode,
    show: (rows) => rows.some((row) => row.hasNoProductIdentifier),
  },
  {
    field: "availableAt",
    value: "",
    label: "Marcar próximamente",
    description:
      "Se ven en la tienda como «Llega el…» sin botón de compra hasta la fecha que elijas.",
    partition: "coming-soon",
    icon: CalendarClock,
    show: (rows) => rows.some((row) => !isComingSoon(row)),
  },
  {
    field: "availableAt",
    value: null,
    label: "Quitar próximamente",
    description: "Vuelven a venderse desde ya con su stock actual.",
    partition: "available-now",
    icon: CalendarX2,
    show: (rows) => rows.some((row) => isComingSoon(row)),
  },
  {
    field: "categoryId",
    value: "",
    label: "Cambiar subcategoría",
    description:
      "Reemplaza la subcategoría actual. No afecta precio, stock ni visibilidad.",
    icon: Tag,
    picker: "categories",
    show: () => true,
  },
  {
    field: "colorId",
    value: "",
    label: "Cambiar color",
    description:
      "Reemplaza el color. Es un atributo de catálogo: no cambia lo que hay en bodega.",
    icon: Palette,
    picker: "colors",
    show: () => true,
  },
  {
    field: "sizeId",
    value: "",
    label: "Cambiar tamaño",
    description:
      "Reemplaza el tamaño. Es un atributo de catálogo: no cambia lo que hay en bodega.",
    icon: Ruler,
    picker: "sizes",
    show: () => true,
  },
  {
    field: "designId",
    value: "",
    label: "Cambiar diseño",
    description:
      "Reemplaza el diseño. Es un atributo de catálogo: no cambia lo que hay en bodega.",
    icon: Shapes,
    picker: "designs",
    show: () => true,
  },
];

function downloadCsv(text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `productos-${localDateToPromotionDay(new Date())}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const plural = (count: number) =>
  `${count} ${count === 1 ? "producto" : "productos"}`;

export function ProductBulkActions({
  table,
  taxonomies,
}: {
  table: Table<ProductColumn>;
  taxonomies: BulkTaxonomies;
}) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [date, setDate] = useState("");
  const [pickedValue, setPickedValue] = useState("");
  const [expandGroups, setExpandGroups] = useState(false);
  const [siblings, setSiblings] = useState<{
    total: number;
    archived: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original);
  const groupIds = Array.from(
    new Set(selected.map((product) => product.productGroupId).filter(Boolean)),
  ) as string[];

  const partition = pending?.partition
    ? partitionForBulk(selected, pending.partition)
    : {
        eligible: selected,
        skipped: [] as { row: ProductColumn; reason: string }[],
      };
  const eligibleIds = partition.eligible.map((row) => row.id);

  // El conteo de variantes hermanas lo da el servidor: la vista del navegador
  // no ve las archivadas ni las de otras pestañas.
  useEffect(() => {
    if (!pending || groupIds.length === 0) {
      setSiblings(null);
      return;
    }
    let cancelled = false;
    axios
      .post<{
        affected: number;
        siblings: { total: number; archived: number };
      }>(`/api/${params.storeId}/${Models.Products}/bulk-update`, {
        productIds: eligibleIds,
        productGroupIds: groupIds,
        field: pending.field,
        value: pending.value,
        preview: true,
      })
      .then((response) => {
        if (!cancelled) setSiblings(response.data.siblings);
      })
      .catch(() => {
        if (!cancelled) setSiblings(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pending?.field,
    pending?.value,
    groupIds.join(","),
    eligibleIds.join(","),
  ]);

  if (selected.length === 0) return null;

  const needsDate = pending?.field === "availableAt" && pending.value !== null;
  const needsPick = Boolean(pending?.picker);
  const pickerOptions = pending?.picker ? taxonomies[pending.picker] : [];
  const siblingCount = siblings?.total ?? 0;
  const affected = eligibleIds.length + (expandGroups ? siblingCount : 0);

  const closeDialog = () => {
    setPending(null);
    setPickedValue("");
    setExpandGroups(false);
    setSiblings(null);
  };

  const run = async () => {
    if (!pending) return;
    if (needsDate && !date) {
      toast({
        description: "Elige la fecha de llegada",
        variant: "destructive",
      });
      return;
    }
    if (needsPick && !pickedValue) {
      toast({
        description: "Elige un valor para aplicar",
        variant: "destructive",
      });
      return;
    }
    try {
      setLoading(true);
      const response = await axios.post<{ message: string }>(
        `/api/${params.storeId}/${Models.Products}/bulk-update`,
        {
          productIds: eligibleIds,
          ...(expandGroups && groupIds.length > 0
            ? { productGroupIds: groupIds }
            : {}),
          field: pending.field,
          value: needsDate ? date : needsPick ? pickedValue : pending.value,
        },
      );
      toast({
        title: `${pending.label}: listo`,
        description: response.data.message,
        variant: "success",
      });
      table.resetRowSelection();
      router.refresh();
      closeDialog();
    } catch (error) {
      toast({
        title: `No se pudo ${pending.label.toLowerCase()}`,
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const countLabel = (action: (typeof ACTIONS)[number]) => {
    if (!action.partition) return "";
    const eligible = partitionForBulk(selected, action.partition).eligible
      .length;
    return eligible === selected.length
      ? ""
      : ` (${eligible} de ${selected.length})`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {ACTIONS.filter((action) => action.show(selected)).map((action) => (
          <Button
            key={`${action.field}-${String(action.value)}`}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDate("");
              setPickedValue("");
              setExpandGroups(false);
              setPending(action);
            }}
            disabled={loading}
          >
            <action.icon className="mr-2 h-4 w-4" aria-hidden="true" />
            {action.label}
            {countLabel(action)}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={() =>
            downloadCsv(productsToCsv(selected, currencyFormatter))
          }
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Exportar CSV
        </Button>
      </div>
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !loading && closeDialog()}
      >
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿{pending?.label} en {plural(affected)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending?.partition && (
            <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
              {selected.map((row) => {
                const skipped = partition.skipped.find(
                  (entry) => entry.row.id === row.id,
                );
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">
                        {row.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {skipped ? skipped.reason : row.sku}
                      </span>
                    </div>
                    <TintBadge
                      label={skipped ? "Se omite" : "Se aplica"}
                      tone={skipped ? "slate" : "mint"}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {needsDate && (
            <DateField
              value={date}
              onChange={setDate}
              aria-label="Fecha de llegada"
              placeholder="¿Cuándo llega?"
            />
          )}
          {needsPick && (
            <div className="rounded-md border">
              <Command>
                <CommandInput placeholder="Buscar…" />
                <CommandList className="max-h-48">
                  <CommandEmpty>No hay opciones disponibles.</CommandEmpty>
                  <CommandGroup>
                    {pickerOptions.map((option) => (
                      <CommandItem
                        key={option.id}
                        value={option.name}
                        onSelect={() => setPickedValue(option.id)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            option.id === pickedValue
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                          aria-hidden="true"
                        />
                        <span className="flex-1">{option.name}</span>
                        {option.value && option.value.startsWith("#") && (
                          <span
                            className="ml-2 h-4 w-4 shrink-0 rounded-full border"
                            style={{ backgroundColor: option.value }}
                            aria-hidden="true"
                          />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          )}
          {groupIds.length > 0 && (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-tint-cream bg-tint-cream/30 p-3">
              <Checkbox
                checked={expandGroups}
                disabled={loading || siblings === null || siblingCount === 0}
                onCheckedChange={(checked) => setExpandGroups(checked === true)}
                aria-label="Aplicar también a las demás variantes de sus grupos"
              />
              <span className="text-xs leading-relaxed text-primary">
                <strong>Incluir las demás variantes de estos grupos.</strong>{" "}
                {siblings === null
                  ? "Contando variantes…"
                  : siblingCount === 0
                    ? "No hay más variantes en sus grupos."
                    : `Se suman ${plural(siblingCount)} más${siblings.archived ? ` (${siblings.archived} ${siblings.archived === 1 ? "archivado" : "archivados"})` : ""}: ${eligibleIds.length + siblingCount} en total.`}
              </span>
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void run();
              }}
              disabled={loading || affected === 0}
            >
              {loading
                ? "Aplicando…"
                : affected === 0
                  ? `Nada que ${pending?.label.toLowerCase()}`
                  : `${pending?.label} ${affected}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
