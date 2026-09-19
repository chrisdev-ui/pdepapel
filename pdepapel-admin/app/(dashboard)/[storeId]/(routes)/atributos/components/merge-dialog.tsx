"use client";

import axios from "axios";
import { AlertTriangle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { ATTRIBUTE_KIND_LABELS } from "@/lib/attribute-archive";
import type { AttributeMergePreview, MergeableKind } from "@/lib/attribute-merge";

export interface MergeCandidate {
  id: string;
  name: string;
  /** Productos que lo usan. */
  usage: number;
  /** Solo colores: la muestra. */
  value?: string | null;
  /** Solo subcategorías: categoría padre. */
  parent?: string | null;
}

interface MergeAttributesDialogProps {
  storeId: string;
  kind: MergeableKind;
  /** Uno (la fila) o varios (la selección en lote). */
  selectedIds: string[];
  /** Filas activas de la familia. */
  candidates: MergeCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * «Unir con…»: elige qué valor se queda, muestra cuántos productos pasan y
 * si algún grupo quedaría con dos variantes iguales (misma regla que al
 * guardar un grupo). El valor que desaparece queda archivado, no borrado.
 */
export function MergeAttributesDialog({ storeId, kind, selectedIds, candidates, open, onOpenChange, onDone }: MergeAttributesDialogProps) {
  const { toast } = useToast();
  const labels = ATTRIBUTE_KIND_LABELS[kind];
  const bulk = selectedIds.length > 1;
  const selected = useMemo(() => candidates.filter((row) => selectedIds.includes(row.id)), [candidates, selectedIds]);
  // En lote se elige cuál de los seleccionados se queda (por defecto el más usado); desde una fila, cualquier otro.
  const targets = useMemo(
    () => (bulk ? [...selected].sort((a, b) => b.usage - a.usage) : candidates.filter((row) => !selectedIds.includes(row.id))),
    [bulk, selected, candidates, selectedIds],
  );
  const [targetId, setTargetId] = useState<string | null>(bulk ? (targets[0]?.id ?? null) : null);
  const [preview, setPreview] = useState<AttributeMergePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const sourceIds = useMemo(() => selectedIds.filter((id) => id !== targetId), [selectedIds, targetId]);
  const target = targets.find((row) => row.id === targetId) ?? null;
  const sources = candidates.filter((row) => sourceIds.includes(row.id));

  useEffect(() => {
    if (!targetId || sourceIds.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreviewError(null);
    axios
      .post<AttributeMergePreview>(`/api/${storeId}/attributes/merge`, { kind, sourceIds, targetId, dryRun: true })
      .then((response) => {
        if (!cancelled) setPreview(response.data);
      })
      .catch((error) => {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, kind, sourceIds, targetId]);

  const confirm = async () => {
    if (!targetId || sourceIds.length === 0) return;
    try {
      setSaving(true);
      const response = await axios.post<{ message: string }>(`/api/${storeId}/attributes/merge`, { kind, sourceIds, targetId });
      toast({ description: response.data.message, variant: "success" });
      onDone();
    } catch (error) {
      toast({ title: "No se pudo unir", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const moving = preview ? preview.products.active + preview.products.archived : 0;
  const blocked = Boolean(preview && preview.collisions.length > 0);
  const sourceNames = sources.map((row) => `«${row.name}»`).join(", ");
  const title = target ? `Unir ${sourceNames} en «${target.name}»` : bulk ? `Unir ${plural(selectedIds.length, labels.singular, labels.plural)}` : `Unir ${sourceNames} con…`;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words">{title}</DialogTitle>
          <DialogDescription>
            Los productos pasan al {labels.singular} que se queda. {bulk ? "Los demás" : "El que desaparece"} quedan archivados, no borrados: restaurarlos no deshace el movimiento, pero conserva el valor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="merge-target">Se queda</Label>
            <Combobox
              id="merge-target"
              value={targetId}
              onChange={setTargetId}
              disabled={saving}
              placeholder={`Elige el ${labels.singular} que se queda`}
              searchPlaceholder={`Buscar ${labels.singular}…`}
              options={targets.map((row) => ({
                value: row.id,
                label: row.name,
                description: `${plural(row.usage, "producto", "productos")}${row.parent ? ` · ${row.parent}` : ""}`,
                icon: row.value ? <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: row.value }} aria-hidden="true" /> : undefined,
              }))}
            />
          </div>

          {target && sourceIds.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm" aria-live="polite">
              {loading && <li className="text-muted-foreground">Calculando…</li>}
              {previewError && (
                <li className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{previewError}</span>
                </li>
              )}
              {preview && (
                <>
                  <li className="flex items-center gap-2 rounded-lg border p-3">
                    <TintBadge label={String(moving)} tone="mint" />
                    <span>
                      {moving === 1 ? "producto pasa" : "productos pasan"} a «{target.name}»
                      {preview.products.archived > 0 && ` (${preview.products.archived} archivados)`}. SKU y etiquetas impresas no cambian.
                    </span>
                  </li>
                  {kind !== "categories" && (
                    <li className={`flex items-start gap-2 rounded-lg border p-3 ${blocked ? "border-destructive/40 bg-destructive/5" : ""}`}>
                      <TintBadge label={String(preview.collisions.length)} tone={blocked ? "pink" : "mint"} />
                      <span>
                        {blocked
                          ? `${preview.collisions.length === 1 ? "grupo quedaría" : "grupos quedarían"} con dos variantes iguales (mismo tamaño, color y diseño). La unión se detiene aquí; no se toca nada.`
                          : `variantes chocarían con otra de su grupo${preview.groups > 0 ? ` (${plural(preview.groups, "grupo revisado", "grupos revisados")})` : ""}.`}
                      </span>
                    </li>
                  )}
                  {blocked && (
                    <li className="flex flex-col gap-1.5">
                      {preview.collisions.map((collision) => (
                        <Link
                          key={collision.groupId}
                          href={`/${storeId}/productos/grupo/${collision.groupId}`}
                          target="_blank"
                          className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm text-primary underline-offset-4 hover:underline"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-semibold">{collision.groupName}</span> · {collision.variants.map((variant) => variant.name).join(" / ")}
                          </span>
                          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                        </Link>
                      ))}
                      <span className="text-xs text-muted-foreground">Cambia el atributo de una de las variantes en cada grupo y vuelve a intentar.</span>
                    </li>
                  )}
                  {kind === "categories" && (
                    <li className="flex items-start gap-2 rounded-lg border p-3">
                      <TintBadge label="URL" tone="sky" />
                      <span>
                        Las páginas de {sourceNames} siguen abriendo: sus URL quedan como alias de «{target.name}».
                        {preview.offers > 0 && ` ${plural(preview.offers, "oferta pasa", "ofertas pasan")} también.`}
                        {preview.crossType && " Ojo: cruza de categoría; los productos cambian de sección en el menú."}
                      </span>
                    </li>
                  )}
                  {kind === "sizes" && (
                    <li className="flex items-start gap-2 rounded-lg border p-3">
                      <TintBadge label="Envío" tone="cream" />
                      <span>El peso del tamaño entra en la cotización de envío: los productos movidos se cotizarán como «{target.name}».</span>
                    </li>
                  )}
                  <li className="flex items-start gap-2 rounded-lg border p-3">
                    <TintBadge label="Tienda" tone="cream" />
                    <span>Los filtros de la tienda y los feeds se refrescan al terminar.</span>
                  </li>
                </>
              )}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!preview || blocked || loading || saving || sourceIds.length === 0} isLoading={saving} loadingText="Uniendo…" onClick={() => void confirm()}>
            {preview && !blocked ? `Unir ${plural(moving, "producto", "productos")}` : "Unir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
