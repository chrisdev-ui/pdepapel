"use client";

import axios from "axios";
import { useEffect, useMemo, useState } from "react";

import { BrandPicker, type BrandOption } from "@/components/brands/brand-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";

interface AssignPreview {
  requested: number;
  withOtherBrand: { id: string; name: string; brandName: string }[];
  extraVariants: number;
  groups: number;
}

export interface BrandAssignTarget {
  id: string;
  name: string;
}

const plural = (count: number) => `${count} ${count === 1 ? "producto" : "productos"}`;

/**
 * «Asignar marca» / «Quitar marca» en lote. Los que ya tienen otra marca se
 * listan con su casilla: sin marcar conservan la suya. Un producto de un grupo
 * arrastra a sus variantes, y el diálogo dice cuántas.
 */
export function BrandAssignDialog({
  open,
  mode,
  storeId,
  products,
  brands,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  mode: "assign" | "remove";
  storeId: string;
  products: BrandAssignTarget[];
  brands: BrandOption[];
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [brandId, setBrandId] = useState<string | null>(null);
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<AssignPreview | null>(null);
  const [counts, setCounts] = useState<AssignPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // La selección se recalcula en cada render de la tabla: la clave estable evita pedir la vista previa sin parar.
  const allIdsKey = products.map((product) => product.id).join(",");
  const allIds = useMemo(() => (allIdsKey ? allIdsKey.split(",") : []), [allIdsKey]);
  const targetBrandId = mode === "remove" ? null : brandId;
  const ready = mode === "remove" || Boolean(brandId);
  const brandName = brands.find((brand) => brand.id === brandId)?.name ?? "";

  useEffect(() => {
    if (!open) {
      setBrandId(null);
      setReplace(new Set());
      setConflicts(null);
      setCounts(null);
      setPreviewError(null);
    }
  }, [open]);

  const conflictIds = useMemo(
    () => new Set(mode === "remove" ? [] : (conflicts?.withOtherBrand ?? []).map((row) => row.id)),
    [conflicts, mode],
  );
  const includedIds = useMemo(
    () => allIds.filter((id) => !conflictIds.has(id) || replace.has(id)),
    [allIds, conflictIds, replace],
  );

  // Primero con toda la selección (quién tiene otra marca); después solo con
  // los que cambian, porque las variantes arrastradas dependen de esos ids.
  useEffect(() => {
    if (!open || !ready || allIds.length === 0) return;
    let cancelled = false;
    setConflicts(null);
    setPreviewError(null);
    axios
      .post<AssignPreview>(`/api/${storeId}/brands/assign`, { brandId: targetBrandId, productIds: allIds, preview: true })
      .then((response) => !cancelled && setConflicts(response.data))
      .catch((error) => !cancelled && setPreviewError(getErrorMessage(error)));
    return () => {
      cancelled = true;
    };
  }, [open, ready, storeId, targetBrandId, allIds]);

  const includedKey = includedIds.join(",");
  useEffect(() => {
    if (!open || !conflicts) return;
    if (includedIds.length === allIds.length) {
      setCounts(conflicts);
      return;
    }
    if (includedIds.length === 0) {
      setCounts({ requested: 0, withOtherBrand: [], extraVariants: 0, groups: 0 });
      return;
    }
    let cancelled = false;
    setCounts(null);
    axios
      .post<AssignPreview>(`/api/${storeId}/brands/assign`, {
        brandId: targetBrandId,
        productIds: includedIds,
        preview: true,
      })
      .then((response) => !cancelled && setCounts(response.data))
      .catch((error) => !cancelled && setPreviewError(getErrorMessage(error)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conflicts, includedKey, storeId, targetBrandId]);

  const apply = async () => {
    if (!ready || includedIds.length === 0) return;
    try {
      setSaving(true);
      const { data } = await axios.post<{ updatedProducts: number }>(`/api/${storeId}/brands/assign`, {
        brandId: targetBrandId,
        productIds: includedIds,
      });
      toast({
        description:
          mode === "remove"
            ? `${plural(data.updatedProducts)} quedaron sin marca.`
            : `${brandName} quedó en ${plural(data.updatedProducts)}.`,
        variant: "success",
      });
      onDone();
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const keep = mode === "assign" ? conflicts?.withOtherBrand ?? [] : [];
  const changing = products.filter((product) => includedIds.includes(product.id) && !conflictIds.has(product.id));
  const confirmLabel = saving
    ? "Guardando…"
    : mode === "remove"
      ? `Quitar la marca a ${plural(includedIds.length)}`
      : brandName
        ? `Asignar ${brandName} a ${plural(includedIds.length)}`
        : "Elige una marca";

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "remove" ? `Quitar la marca a ${plural(products.length)}` : `Asignar marca a ${plural(products.length)}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "remove"
              ? "Quedan «Sin marca» (genérico o hecho a mano). Si alguno está en un grupo, el grupo entero queda sin marca."
              : "En un grupo la marca es una sola: si eliges una variante, cambia todo su grupo."}
          </DialogDescription>
        </DialogHeader>

        {mode === "assign" && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" id="brand-assign-label">
              Marca
            </span>
            <BrandPicker
              storeId={storeId}
              brands={brands}
              value={brandId}
              onChange={setBrandId}
              allowCreate
              aria-describedby="brand-assign-label"
            />
          </div>
        )}

        {previewError && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {previewError}
          </p>
        )}

        {ready && !conflicts && !previewError && <p className="text-sm text-muted-foreground">Revisando los productos…</p>}

        {ready && conflicts && (
          <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm">
            {changing.length > 0 && (
              <div>
                <p className="font-semibold">
                  {mode === "remove" ? "Quedan sin marca:" : `Quedan con la marca ${brandName}:`}
                </p>
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                  {changing.map((product) => (
                    <li key={product.id}>{product.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {keep.length > 0 ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 font-semibold">Ya tienen otra marca. Marca los que quieres cambiar:</legend>
                {keep.map((row) => (
                  <label key={row.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 hover:bg-accent">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-primary"
                      checked={replace.has(row.id)}
                      onChange={(event) =>
                        setReplace((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      {row.name} <span className="text-muted-foreground">· hoy {row.brandName}</span>
                    </span>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">Sin marcar conservan su marca actual.</p>
              </fieldset>
            ) : (
              mode === "assign" && (
                <p className="text-muted-foreground">
                  Ninguno tenía otra marca. Si alguno la tuviera, se mostraría aquí y no cambiaría sin marcarlo.
                </p>
              )
            )}
            {counts && counts.extraVariants > 0 && (
              <p className="rounded-md bg-tint-cream/40 px-2 py-1.5">
                Cambian además {counts.extraVariants} {counts.extraVariants === 1 ? "variante" : "variantes"} porque en un
                grupo la marca es una sola.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={saving || !ready || !conflicts || !counts || includedIds.length === 0}
            onClick={() => void apply()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
