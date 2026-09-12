"use client";

import {
  Archive,
  ArchiveRestore,
  Barcode,
  CalendarClock,
  CalendarX2,
  Check,
  Palette,
  Ruler,
  ScanBarcode,
  Shapes,
  Star,
  StarOff,
  Tag,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
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
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";
import { isComingSoon } from "@/lib/product-availability";
import { productLacksIdentifier } from "@/lib/product-readiness";

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

/** Opción de una taxonomía del catálogo. */
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
  description: string;
  /** Las taxonomías piden un valor antes de aplicar. */
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
      "Los productos archivados desaparecen de la tienda y responden 404, pero conservan su historial de pedidos y sus movimientos. Se pueden restaurar.",
    icon: Archive,
    show: (rows) => rows.some((row) => !row.isArchived),
  },
  {
    field: "isArchived",
    value: false,
    label: "Restaurar",
    description:
      "Los productos vuelven a estar disponibles en la tienda con su stock y precio actuales.",
    icon: ArchiveRestore,
    show: (rows) => rows.some((row) => row.isArchived),
  },
  {
    field: "isFeatured",
    value: true,
    label: "Destacar",
    description:
      "Los productos destacados aparecen primero en la portada de la tienda.",
    icon: Star,
    show: (rows) => rows.some((row) => !row.isFeatured),
  },
  {
    field: "isFeatured",
    value: false,
    label: "Quitar destacado",
    description:
      "Los productos dejan de aparecer en la portada; siguen en su categoría.",
    icon: StarOff,
    show: (rows) => rows.some((row) => row.isFeatured),
  },
  {
    field: "hasNoProductIdentifier",
    value: true,
    label: "Marcar sin identificador",
    description:
      "Para productos que de verdad no tienen código de barras del fabricante. Se marcan como «No tiene identificador global», se vacían GTIN y MPN, y Google Merchant los acepta así. Nunca inventes un GTIN.",
    icon: Barcode,
    show: (rows) => rows.some((row) => productLacksIdentifier(row)),
  },
  {
    field: "hasNoProductIdentifier",
    value: false,
    label: "Quitar marca sin identificador",
    description:
      "Los productos vuelven a pedir un GTIN real o la marca; úsalo si vas a registrar sus códigos de barras.",
    icon: ScanBarcode,
    show: (rows) => rows.some((row) => row.hasNoProductIdentifier),
  },
  {
    field: "availableAt",
    value: "",
    label: "Marcar próximamente",
    description:
      "Los productos se ven en la tienda como «Llega el…» sin botón de compra hasta la fecha que elijas. Úsalo para el cargamento que viene.",
    icon: CalendarClock,
    show: (rows) => rows.some((row) => !isComingSoon(row)),
  },
  {
    field: "availableAt",
    value: null,
    label: "Quitar próximamente",
    description:
      "Los productos vuelven a venderse desde ya con su stock actual.",
    icon: CalendarX2,
    show: (rows) => rows.some((row) => isComingSoon(row)),
  },
  // Los cuatro campos de taxonomía que vivían en «Gestión masiva». Aquí
  // comparten el mismo endpoint, la misma confirmación honesta y la misma
  // regla de selección que el resto de acciones en lote.
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
      "Reemplaza el color de los productos seleccionados. Es un atributo de catálogo: no cambia lo que hay en bodega.",
    icon: Palette,
    picker: "colors",
    show: () => true,
  },
  {
    field: "sizeId",
    value: "",
    label: "Cambiar tamaño",
    description:
      "Reemplaza el tamaño de los productos seleccionados. Es un atributo de catálogo: no cambia lo que hay en bodega.",
    icon: Ruler,
    picker: "sizes",
    show: () => true,
  },
  {
    field: "designId",
    value: "",
    label: "Cambiar diseño",
    description:
      "Reemplaza el diseño de los productos seleccionados. Es un atributo de catálogo: no cambia lo que hay en bodega.",
    icon: Shapes,
    picker: "designs",
    show: () => true,
  },
];

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
  const [loading, setLoading] = useState(false);

  const selected = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original);

  const allRows = table.getCoreRowModel().rows.map((row) => row.original);
  /**
   * Grupos tocados por la selección. «Gestión masiva» mandaba SIEMPRE estos
   * ids y el endpoint los expandía a todas las variantes del grupo, así que
   * seleccionar una variante de doce las cambiaba las doce mientras el botón
   * decía «1». Ahora es una casilla que dice cuántos productos se suman.
   */
  const groupIds = Array.from(
    new Set(selected.map((product) => product.productGroupId).filter(Boolean)),
  ) as string[];
  const selectedIds = new Set(selected.map((product) => product.id));
  const siblingCount = allRows.filter(
    (product) =>
      product.productGroupId &&
      groupIds.includes(product.productGroupId) &&
      !selectedIds.has(product.id),
  ).length;

  if (selected.length === 0) return null;

  const needsDate = pending?.field === "availableAt" && pending.value !== null;
  const needsPick = Boolean(pending?.picker);
  const pickerOptions = pending?.picker ? taxonomies[pending.picker] : [];
  const affected = selected.length + (expandGroups ? siblingCount : 0);

  const closeDialog = () => {
    setPending(null);
    setPickedValue("");
    setExpandGroups(false);
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
          productIds: selected.map((product) => product.id),
          // Solo se expande si la persona lo pidió explícitamente.
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
    } catch (error) {
      toast({
        title: `No se pudo ${pending.label.toLowerCase()}`,
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      closeDialog();
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
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
          </Button>
        ))}
      </div>
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿{pending?.label} en {affected} producto
              {affected === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
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
          {siblingCount > 0 && (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-tint-cream bg-tint-cream/30 p-3">
              <Checkbox
                checked={expandGroups}
                disabled={loading}
                onCheckedChange={(checked) => setExpandGroups(checked === true)}
                aria-label="Aplicar también a las demás variantes de sus grupos"
              />
              <span className="text-xs leading-relaxed text-primary">
                <strong>
                  Aplicar también a las demás variantes de sus grupos.
                </strong>{" "}
                Se suman {siblingCount} producto{siblingCount === 1 ? "" : "s"}{" "}
                más, {selected.length + siblingCount} en total.
              </span>
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={run} disabled={loading}>
              {loading ? "Aplicando…" : `Sí, ${pending?.label.toLowerCase()}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
