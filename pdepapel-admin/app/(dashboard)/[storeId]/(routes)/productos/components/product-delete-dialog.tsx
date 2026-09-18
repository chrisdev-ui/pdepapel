"use client";

import axios from "axios";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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
import { TintBadge } from "@/components/ui/tint-badge";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { ProductDeleteCheck } from "@/lib/product-deletion";

interface ProductDeleteDialogProps {
  productId: string;
  productName: string;
  isArchived: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama después de eliminar o de archivar en su lugar. */
  onDone: (outcome: "deleted" | "archived") => void;
}

const BLOCKER_TONE: Record<string, string> = {
  pedidos: "sky",
  kits: "cream",
  mercadolibre: "lavender",
  ferias: "pink",
  reposicion: "slate",
  preventa: "slate",
  inventario: "slate",
};

/**
 * Antes de eliminar se consulta qué lo impide y se muestra con nombres.
 * Bloqueado: la acción principal es archivar. Libre: se dice qué desaparece
 * y se pide una confirmación explícita.
 */
export function ProductDeleteDialog({
  productId,
  productName,
  isArchived,
  open,
  onOpenChange,
  onDone,
}: ProductDeleteDialogProps) {
  const params = useParams();
  const { toast } = useToast();
  const [check, setCheck] = useState<ProductDeleteCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setCheck(null);
      setError(null);
      setConfirmed(false);
      return;
    }
    let cancelled = false;
    axios
      .get<ProductDeleteCheck>(
        `/api/${params.storeId}/${Models.Products}/${productId}/delete-check`,
      )
      .then((response) => {
        if (!cancelled) setCheck(response.data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, params.storeId, productId]);

  const archiveInstead = async () => {
    try {
      setBusy(true);
      const response = await axios.post<{ pausedListings: number }>(
        `/api/${params.storeId}/${Models.Products}/bulk-update`,
        { productIds: [productId], field: "isArchived", value: true },
      );
      toast({
        description: `«${productName}» quedó archivado.${response.data.pausedListings ? " Su publicación en Mercado Libre se pausa." : ""}`,
        variant: "success",
      });
      onOpenChange(false);
      onDone("archived");
    } catch (err) {
      toast({ description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      setBusy(true);
      await axios.delete(
        `/api/${params.storeId}/${Models.Products}/${productId}`,
      );
      toast({
        description: `«${productName}» se eliminó.`,
        variant: "success",
      });
      onOpenChange(false);
      onDone("deleted");
    } catch (err) {
      toast({ description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const blocked = check?.blocked ?? false;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {check
              ? blocked
                ? `No se puede eliminar «${productName}»`
                : `¿Eliminar «${productName}»?`
              : `Revisando «${productName}»…`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {check
              ? blocked
                ? "Otras partes del sistema dependen de este producto. Eliminarlo rompería su historial."
                : "No tiene pedidos ni vínculos. Esto es lo que desaparece y lo que se conserva."
              : (error ??
                "Buscando pedidos, kits, publicaciones, ferias y reposiciones que lo usen.")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!check && !error && (
          <div className="flex items-center justify-center py-6">
            <Loader2
              className="h-5 w-5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        )}

        {check && blocked && (
          <ul className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
            {check.blockers.map((blocker) => (
              <li key={blocker.kind} className="flex items-start gap-2">
                <TintBadge
                  label={blocker.label}
                  tone={BLOCKER_TONE[blocker.kind] ?? "slate"}
                  className="mt-0.5 shrink-0"
                />
                <span>{blocker.detail}</span>
              </li>
            ))}
          </ul>
        )}

        {check && !blocked && (
          <>
            <ul className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
              <li className="flex items-start gap-2">
                <TintBadge
                  label="Fotos"
                  tone="slate"
                  className="mt-0.5 shrink-0"
                />
                <span>
                  {check.removes.images === 0
                    ? "No tiene fotos."
                    : `${check.removes.images} ${check.removes.images === 1 ? "foto se borra" : "fotos se borran"} de Cloudinary después de eliminar.`}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <TintBadge
                  label="URL"
                  tone="slate"
                  className="mt-0.5 shrink-0"
                />
                <span>
                  /producto/{check.slug} dejará de existir
                  {check.removes.aliases > 0
                    ? ` (y ${check.removes.aliases} ${check.removes.aliases === 1 ? "redirección antigua" : "redirecciones antiguas"})`
                    : ""}
                  .
                </span>
              </li>
              <li className="flex items-start gap-2">
                <TintBadge
                  label="Inventario"
                  tone="slate"
                  className="mt-0.5 shrink-0"
                />
                <span>
                  Solo tiene la entrada inicial; no hay historial de ventas ni
                  ajustes que perder.
                </span>
              </li>
            </ul>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <Checkbox
                checked={confirmed}
                disabled={busy}
                onCheckedChange={(value) => setConfirmed(value === true)}
                aria-label="Confirmo que quiero eliminarlo"
                className="mt-0.5"
              />
              <span>
                Entiendo que no se puede deshacer. Si dudo, prefiero archivar.
              </span>
            </label>
          </>
        )}

        {check && blocked && !isArchived && (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <strong className="text-primary">Archivar</strong> lo saca de la
            tienda y pausa Mercado Libre, conserva pedidos, kardex y URL, y se
            puede revertir.
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          {check && blocked && !isArchived && (
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void archiveInstead();
              }}
            >
              {busy ? "Archivando…" : "Archivar en su lugar"}
            </AlertDialogAction>
          )}
          {check && !blocked && (
            <>
              {!isArchived && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void archiveInstead()}
                >
                  Archivar
                </Button>
              )}
              <AlertDialogAction
                disabled={busy || !confirmed}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(event) => {
                  event.preventDefault();
                  void remove();
                }}
              >
                {busy ? "Eliminando…" : "Eliminar definitivamente"}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
