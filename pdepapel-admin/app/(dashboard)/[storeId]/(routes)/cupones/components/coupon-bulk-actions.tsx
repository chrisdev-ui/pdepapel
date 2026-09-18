"use client";

import type { Table } from "@tanstack/react-table";
import axios from "axios";
import { Ban, Download, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

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
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { couponsToCsv, partitionForDeactivate, partitionForDelete, type BulkPartition } from "@/lib/coupon-bulk";
import { getPromotionStatus, PROMOTION_STATUS } from "@/lib/promotion-status";
import { localDateToPromotionDay } from "@/lib/promotion-window";
import { currencyFormatter } from "@/lib/utils";

import type { CouponColumn } from "./columns";

type Pending = "delete" | "deactivate";

const COPY: Record<Pending, { verb: string; done: string; description: string; skippedBadge: string }> = {
  delete: {
    verb: "Eliminar",
    done: "Se elimina",
    description: "Se borran del todo. Nadie más podrá usarlos y no se pueden recuperar.",
    skippedBadge: "Se omite",
  },
  deactivate: {
    verb: "Desactivar",
    done: "Se desactiva",
    description: "Dejan de aplicar desde ahora. Conservan su vigencia y sus usos; se pueden volver a encender desde cada cupón.",
    skippedBadge: "Se omite",
  },
};

const plural = (count: number) => `${count} ${count === 1 ? "cupón" : "cupones"}`;

function downloadCsv(text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cupones-${localDateToPromotionDay(new Date())}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Acciones en lote de la tabla de cupones: desactivar, eliminar y exportar la selección. */
export function CouponBulkActions({ table }: { table: Table<CouponColumn> }) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  if (selected.length === 0) return null;

  const deletion = partitionForDelete(selected);
  const deactivation = partitionForDeactivate(selected);
  const partition: BulkPartition<CouponColumn> = pending === "delete" ? deletion : deactivation;
  const copy = pending ? COPY[pending] : COPY.delete;

  const run = async () => {
    if (!pending) return;
    const ids = partition.eligible.map((row) => row.id);
    try {
      setLoading(true);
      if (pending === "delete") {
        const response = await axios.delete<{ deleted: number; skipped: { code: string }[] }>(`/api/${storeId}/coupons`, { data: { ids } });
        const skipped = response.data.skipped.length;
        toast({
          description: `Se ${response.data.deleted === 1 ? "eliminó" : "eliminaron"} ${plural(response.data.deleted)}${skipped ? `; ${skipped} con pedidos se ${skipped === 1 ? "omitió" : "omitieron"}` : ""}`,
          variant: "success",
        });
      } else {
        const response = await axios.patch<{ deactivated: number }>(`/api/${storeId}/coupons`, { ids });
        toast({ description: `Se ${response.data.deactivated === 1 ? "desactivó" : "desactivaron"} ${plural(response.data.deactivated)}`, variant: "success" });
      }
      table.resetRowSelection();
      router.refresh();
      setPending(null);
    } catch (error) {
      toast({ title: `No se pudo ${copy.verb.toLowerCase()}`, description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const countLabel = (eligible: number) => (eligible === selected.length ? "" : ` (${eligible} de ${selected.length})`);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || deactivation.eligible.length === 0}
          title={deactivation.eligible.length === 0 ? "Ninguno de los seleccionados está encendido" : undefined}
          onClick={() => setPending("deactivate")}
        >
          <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
          Desactivar{countLabel(deactivation.eligible.length)}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => setPending("delete")}>
          <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
          Eliminar{countLabel(deletion.eligible.length)}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => downloadCsv(couponsToCsv(selected, currencyFormatter))}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Exportar CSV
        </Button>
      </div>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && !loading && setPending(null)}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿{copy.verb} {plural(partition.eligible.length)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {partition.skipped.length > 0
                ? `Seleccionaste ${selected.length}. ${pending === "delete" ? "Los que ya tienen pedidos no se pueden borrar: se quedan como están." : "Los que ya están apagados o vencidos no cambian."}`
                : copy.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
            {selected.map((row) => {
              const skipped = partition.skipped.find((entry) => entry.row.id === row.id);
              const status = PROMOTION_STATUS[getPromotionStatus(row)];
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-mono text-sm font-semibold">{row.code}</span>
                    <span className="text-xs text-muted-foreground">{skipped ? skipped.reason : `${status.label} · ${row.usedCount} ${row.usedCount === 1 ? "uso" : "usos"}`}</span>
                  </div>
                  <TintBadge label={skipped ? copy.skippedBadge : copy.done} tone={skipped ? "cream" : "pink"} />
                </li>
              );
            })}
          </ul>
          {pending === "delete" && <p className="text-sm">Esta acción no se puede deshacer.</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading || partition.eligible.length === 0}
              className={pending === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={(event) => {
                event.preventDefault();
                void run();
              }}
            >
              {loading ? `${copy.verb === "Eliminar" ? "Eliminando" : "Desactivando"}…` : partition.eligible.length === 0 ? `Nada que ${copy.verb.toLowerCase()}` : `${copy.verb} ${partition.eligible.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
