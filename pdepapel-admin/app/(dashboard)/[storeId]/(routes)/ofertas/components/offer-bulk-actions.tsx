"use client";

import type { Table } from "@tanstack/react-table";
import axios from "axios";
import { Ban, Download, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { offersToCsv, partitionForEnd } from "@/lib/offer-bulk";
import { getPromotionStatus, PROMOTION_STATUS } from "@/lib/promotion-status";
import { localDateToPromotionDay } from "@/lib/promotion-window";
import { currencyFormatter } from "@/lib/utils";

import { offerScope, type OfferColumn } from "./columns";
import { OFFER_DELETE_COPY, OFFER_END_COPY } from "./offer-copy";

type Pending = "delete" | "end";

const plural = (count: number) => `${count} ${count === 1 ? "oferta" : "ofertas"}`;

function downloadCsv(text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ofertas-${localDateToPromotionDay(new Date())}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Acciones en lote de la tabla de ofertas: terminar ahora, eliminar y exportar la selección. */
export function OfferBulkActions({ table }: { table: Table<OfferColumn> }) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  if (selected.length === 0) return null;

  const ending = partitionForEnd(selected);
  const eligible = pending === "end" ? ending.eligible : selected;

  const run = async () => {
    if (!pending) return;
    const ids = eligible.map((row) => row.id);
    try {
      setLoading(true);
      if (pending === "delete") {
        const response = await axios.delete<{ deleted: number }>(`/api/${storeId}/offers`, { data: { ids } });
        toast({ description: `Se ${response.data.deleted === 1 ? "eliminó" : "eliminaron"} ${plural(response.data.deleted)}`, variant: "success" });
      } else {
        const response = await axios.patch<{ ended: number }>(`/api/${storeId}/offers`, { ids });
        toast({ description: `Se ${response.data.ended === 1 ? "terminó" : "terminaron"} ${plural(response.data.ended)}`, variant: "success" });
      }
      table.resetRowSelection();
      router.refresh();
      setPending(null);
    } catch (error) {
      toast({ title: pending === "delete" ? "No se pudo eliminar" : "No se pudo terminar", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const countLabel = (count: number) => (count === selected.length ? "" : ` (${count} de ${selected.length})`);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="outline" size="sm" disabled={loading || ending.eligible.length === 0} title={ending.eligible.length === 0 ? "Ninguna de las seleccionadas está en curso" : undefined} onClick={() => setPending("end")}>
          <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
          Terminar ahora{countLabel(ending.eligible.length)}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => setPending("delete")}>
          <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
          Eliminar
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => downloadCsv(offersToCsv(selected.map((row) => ({ ...row, scope: offerScope(row) })), currencyFormatter))}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Exportar CSV
        </Button>
      </div>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && !loading && setPending(null)}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{pending === "delete" ? `¿Eliminar ${plural(selected.length)}?` : `¿Terminar ${plural(ending.eligible.length)} ahora?`}</AlertDialogTitle>
            <AlertDialogDescription>{pending === "delete" ? OFFER_DELETE_COPY.description : OFFER_END_COPY.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
            {selected.map((row) => {
              const skipped = pending === "end" ? ending.skipped.find((entry) => entry.row.id === row.id) : undefined;
              const status = PROMOTION_STATUS[getPromotionStatus(row)];
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{row.name}</span>
                    <span className="text-xs text-muted-foreground">{skipped ? `${skipped.reason} · no cambia` : `${status.label} · ${offerScope(row)}`}</span>
                  </div>
                  <TintBadge label={skipped ? "Se omite" : pending === "delete" ? "Se elimina" : "Se termina"} tone={skipped ? "slate" : "pink"} />
                </li>
              );
            })}
          </ul>
          {pending === "delete" && <p className="text-sm">Esta acción no se puede deshacer.</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading || eligible.length === 0}
              className={pending === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={(event) => {
                event.preventDefault();
                void run();
              }}
            >
              {loading ? (pending === "delete" ? "Eliminando…" : "Terminando…") : eligible.length === 0 ? "Nada que terminar" : pending === "delete" ? `Eliminar ${eligible.length}` : `Terminar ${eligible.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
