"use client";

import { Archive, ArchiveRestore, Barcode, CalendarClock, CalendarX2, ScanBarcode, Star, StarOff } from "lucide-react";
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
import { DateField } from "@/components/ui/date-field";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { isComingSoon } from "@/lib/product-availability";
import { productLacksIdentifier } from "@/lib/product-readiness";

import type { ProductColumn } from "./columns";

type BulkField = "isArchived" | "isFeatured" | "hasNoProductIdentifier" | "availableAt";

interface PendingAction {
  field: BulkField;
  value: boolean | string | null;
  label: string;
  description: string;
}

const ACTIONS: Array<PendingAction & { icon: typeof Archive; show: (rows: ProductColumn[]) => boolean }> = [
  {
    field: "isArchived",
    value: true,
    label: "Archivar",
    description: "Los productos archivados desaparecen de la tienda y responden 404, pero conservan su historial de pedidos y sus movimientos. Se pueden restaurar.",
    icon: Archive,
    show: (rows) => rows.some((row) => !row.isArchived),
  },
  {
    field: "isArchived",
    value: false,
    label: "Restaurar",
    description: "Los productos vuelven a estar disponibles en la tienda con su stock y precio actuales.",
    icon: ArchiveRestore,
    show: (rows) => rows.some((row) => row.isArchived),
  },
  {
    field: "isFeatured",
    value: true,
    label: "Destacar",
    description: "Los productos destacados aparecen primero en la portada de la tienda.",
    icon: Star,
    show: (rows) => rows.some((row) => !row.isFeatured),
  },
  {
    field: "isFeatured",
    value: false,
    label: "Quitar destacado",
    description: "Los productos dejan de aparecer en la portada; siguen en su categoría.",
    icon: StarOff,
    show: (rows) => rows.some((row) => row.isFeatured),
  },
  {
    field: "hasNoProductIdentifier",
    value: true,
    label: "Marcar sin identificador",
    description: "Para productos que de verdad no tienen código de barras del fabricante. Se marcan como «No tiene identificador global», se vacían GTIN y MPN, y Google Merchant los acepta así. Nunca inventes un GTIN.",
    icon: Barcode,
    show: (rows) => rows.some((row) => productLacksIdentifier(row)),
  },
  {
    field: "hasNoProductIdentifier",
    value: false,
    label: "Quitar marca sin identificador",
    description: "Los productos vuelven a pedir un GTIN real o la marca; úsalo si vas a registrar sus códigos de barras.",
    icon: ScanBarcode,
    show: (rows) => rows.some((row) => row.hasNoProductIdentifier),
  },
  {
    field: "availableAt",
    value: "",
    label: "Marcar próximamente",
    description: "Los productos se ven en la tienda como «Llega el…» sin botón de compra hasta la fecha que elijas. Úsalo para el cargamento que viene.",
    icon: CalendarClock,
    show: (rows) => rows.some((row) => !isComingSoon(row)),
  },
  {
    field: "availableAt",
    value: null,
    label: "Quitar próximamente",
    description: "Los productos vuelven a venderse desde ya con su stock actual.",
    icon: CalendarX2,
    show: (rows) => rows.some((row) => isComingSoon(row)),
  },
];

export function ProductBulkActions({ table }: { table: Table<ProductColumn> }) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  if (selected.length === 0) return null;

  const needsDate = pending?.field === "availableAt" && pending.value !== null;

  const run = async () => {
    if (!pending) return;
    if (needsDate && !date) {
      toast({ description: "Elige la fecha de llegada", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      const response = await axios.post<{ message: string }>(`/api/${params.storeId}/${Models.Products}/bulk-update`, {
        productIds: selected.map((product) => product.id),
        field: pending.field,
        value: needsDate ? date : pending.value,
      });
      toast({ title: `${pending.label}: listo`, description: response.data.message, variant: "success" });
      table.resetRowSelection();
      router.refresh();
    } catch (error) {
      toast({ title: `No se pudo ${pending.label.toLowerCase()}`, description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setPending(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {ACTIONS.filter((action) => action.show(selected)).map((action) => (
          <Button key={`${action.field}-${String(action.value)}`} type="button" variant="ghost" size="sm" onClick={() => { setDate(""); setPending(action); }} disabled={loading}>
            <action.icon className="mr-2 h-4 w-4" aria-hidden="true" />
            {action.label}
          </Button>
        ))}
      </div>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿{pending?.label} {selected.length} producto{selected.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {needsDate && (
            <DateField value={date} onChange={setDate} aria-label="Fecha de llegada" placeholder="¿Cuándo llega?" />
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
