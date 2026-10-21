"use client";

import axios from "axios";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { EditionSuggestion } from "@/lib/capsule-suggestions";
import { currencyFormatter } from "@/lib/utils";

interface SuggestionsResponse {
  minMarginPct: number | null;
  minSlipCost: number | null;
  packSource: { source: "edition" | "template"; edition: { number: number; name: string } | null } | null;
  missingSetup: "packs" | "margin" | null;
  idleProducts: number;
  suggestions: EditionSuggestion[];
  missing: { themeKey: string | null; label: string; products: { productId: string; name: string; available: number; unitCost: number; reason: string; gift: boolean }[] }[];
  licenses: { productId: string; name: string; term: string; allowed: boolean }[];
  rejected: { themes: { themeKey: string; label: string }[]; products: { themeKey: string; themeLabel: string; productId: string; name: string }[] };
}

const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("es-CO")} %`);

/**
 * Ediciones sugeridas a partir de los productos quietos, «Te faltan estos» y
 * «Revisar licencia». Se calculan al abrir la página (no en el render del
 * servidor) y nada se crea solo: «Usar esta sugerencia» llena el formulario
 * de «Nueva edición».
 */
export function SuggestionsPanel({ onUse }: { onUse: (suggestion: EditionSuggestion) => void }) {
  const params = useParams<{ storeId: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [decided, setDecided] = useState<Record<string, "ACCEPTED" | "REJECTED">>({});
  const api = `/api/${params.storeId}/capsule-suggestions`;

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const { data: body } = await axios.get<SuggestionsResponse>(api);
      setData(body);
    } catch {
      setFailed(true);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const feedback = async (themeKey: string, decision: "ACCEPTED" | "REJECTED", productId?: string) => {
    const key = productId ? `${themeKey}|${productId}` : themeKey;
    setBusy(key);
    try {
      await axios.post(`${api}/feedback`, { themeKey, decision, productId });
      setDecided((current) => ({ ...current, [key]: decision }));
      toast({ title: decision === "ACCEPTED" ? "Anotado: te sirve" : productId ? "Anotado: ese producto no va en este tema" : "Anotado: no vuelve a salir este tema" });
    } catch (error) {
      toast({ title: "No se guardó", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (themeKey: string, productId?: string) => {
    const key = productId ? `${themeKey}|${productId}` : themeKey;
    setBusy(`volver-${key}`);
    try {
      await axios.post(`${api}/feedback`, { themeKey, decision: "ACCEPTED", productId });
      await load();
      toast({ title: "Vuelve a las sugerencias" });
    } catch (error) {
      toast({ title: "No se guardó", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const toggleLicense = async (productId: string, allowed: boolean) => {
    setBusy(`licencia-${productId}`);
    try {
      await axios.put(`${api}/licenses`, { productId, allowed });
      await load();
    } catch (error) {
      toast({ title: "No se guardó", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const decisionButtons = (themeKey: string, label: string, productId?: string) => {
    const key = productId ? `${themeKey}|${productId}` : themeKey;
    const current = decided[key];
    return (
      <div className="flex shrink-0 gap-1" role="group" aria-label={`¿Te sirve ${label}?`}>
        <Button
          type="button"
          variant={current === "ACCEPTED" ? "default" : "outline"}
          size="icon"
          className="h-11 w-11"
          aria-label={`Me sirve: ${label}`}
          aria-pressed={current === "ACCEPTED"}
          disabled={busy === key}
          onClick={() => feedback(themeKey, "ACCEPTED", productId)}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant={current === "REJECTED" ? "destructive" : "outline"}
          size="icon"
          className="h-11 w-11"
          aria-label={`No me sirve: ${label}`}
          aria-pressed={current === "REJECTED"}
          disabled={busy === key}
          onClick={() => feedback(themeKey, "REJECTED", productId)}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    );
  };

  if (failed) {
    return (
      <SectionCard id="sugeridas" title="Ediciones sugeridas" description="No se pudieron calcular las sugerencias.">
        <div>
          <Button variant="outline" className="min-h-[44px]" onClick={load}>
            Intentar de nuevo
          </Button>
        </div>
      </SectionCard>
    );
  }

  if (!data) {
    return (
      <SectionCard id="sugeridas" title="Ediciones sugeridas" description="Buscando productos quietos que armen una edición…">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-48 rounded-lg" />
          ))}
        </div>
      </SectionCard>
    );
  }

  const settingsHref = `/${params.storeId}/configuracion`;
  return (
    <>
      <SectionCard
        id="sugeridas"
        title="Ediciones sugeridas"
        description={`Armadas con productos quietos (90 días sin venta). Cada una pasa el margen mínimo de la tienda (${percent(data.minMarginPct)}) en todos los packs que caben. Nada se crea ni se imprime solo.`}
      >
        {data.missingSetup === "packs" ? (
          <p className="text-sm">
            Para sugerir ediciones falta la plantilla de packs (regalo y caja).{" "}
            <Link href={settingsHref} className="font-medium underline underline-offset-4">
              Llénala en Ajustes
            </Link>
            .
          </p>
        ) : data.missingSetup === "margin" ? (
          <p className="text-sm">
            Para sugerir ediciones falta el margen mínimo de la tienda.{" "}
            <Link href={settingsHref} className="font-medium underline underline-offset-4">
              Ponlo en Ajustes
            </Link>
            .
          </p>
        ) : data.suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Con los productos quietos de hoy no sale ninguna edición que cumpla la banda, la bolsa y el margen. Mira «Te faltan estos».</p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {data.suggestions.map((suggestion) => (
              <li key={suggestion.themeKey} className="flex min-w-0 flex-col gap-3 rounded-lg border bg-white p-4" data-testid="edicion-sugerida">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{suggestion.name}</p>
                    <p className="text-sm text-muted-foreground">{suggestion.pitch}</p>
                  </div>
                  {decisionButtons(suggestion.themeKey, suggestion.name)}
                </div>
                <p className="text-sm">
                  {suggestion.slips} papeles · {suggestion.products} productos · banda {currencyFormatter(suggestion.costBandMin)}–{currencyFormatter(suggestion.costBandMax)} · pack más grande {suggestion.maxPack ?? "—"}
                </p>
                <ul className="flex flex-wrap gap-1.5" aria-label="Margen P95 por pack">
                  {suggestion.packs
                    .filter((pack) => pack.available)
                    .map((pack) => (
                      <li key={pack.packSize}>
                        <TintBadge tone="mint" label={`Pack ${pack.packSize}: P95 ${percent(pack.p95Pct)}`} />
                      </li>
                    ))}
                </ul>
                <details className="rounded-md border">
                  <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-medium">Ver la bolsa ({suggestion.bag.length} productos)</summary>
                  <ul className="flex flex-col divide-y">
                    {suggestion.bag.map((line) => (
                      <li key={line.productId} className="flex items-center justify-between gap-2 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{line.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.quantity} papeles · costo {currencyFormatter(line.unitCost)}
                          </p>
                          <p className="text-xs">{line.reason}</p>
                        </div>
                        {decisionButtons(suggestion.themeKey, line.name, line.productId)}
                      </li>
                    ))}
                  </ul>
                </details>
                <div>
                  <Button className="min-h-[44px] w-full sm:w-auto" onClick={() => onUse(suggestion)}>
                    Usar esta sugerencia
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data.packSource?.source === "edition" && data.packSource.edition && (
          <p className="text-xs text-muted-foreground">
            Regalo y caja de cada pack copiados de la edición #{data.packSource.edition.number} · {data.packSource.edition.name}.
          </p>
        )}
      </SectionCard>

      <SectionCard id="te-faltan" title="Te faltan estos" description="Productos quietos que no están en ninguna sugerencia ni en una edición abierta, agrupados por tema. Los más baratos que el piso de un papel van para regalo.">
        {data.missing.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todos los productos quietos están en alguna sugerencia o edición.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.missing.map((group) => (
              <details key={group.themeKey ?? "sin-tema"} className="rounded-md border bg-white">
                <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 px-3 text-sm font-medium">
                  <span className="truncate">{group.label}</span>
                  <span className="shrink-0 text-muted-foreground">{group.products.length}</span>
                </summary>
                <ul className="flex flex-col divide-y">
                  {group.products.map((row) => (
                    <li key={row.productId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{row.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.available} disp. · {currencyFormatter(row.unitCost)} · {row.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </SectionCard>

      {data.rejected.themes.length + data.rejected.products.length > 0 && (
        <SectionCard id="descartadas" title="Descartadas" description="Lo que marcaste con ✗. No vuelve a salir en las sugerencias hasta que lo devuelvas.">
          <details className="rounded-md border bg-white">
            <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-medium">
              Ver descartadas ({data.rejected.themes.length + data.rejected.products.length})
            </summary>
            <ul className="flex flex-col divide-y">
              {data.rejected.themes.map((row) => (
                <li key={row.themeKey} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">Tema «{row.label}»</span>
                  <Button variant="outline" className="min-h-[44px]" disabled={busy === `volver-${row.themeKey}`} onClick={() => restore(row.themeKey)}>
                    Volver a sugerir
                  </Button>
                </li>
              ))}
              {data.rejected.products.map((row) => (
                <li key={`${row.themeKey}|${row.productId}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {row.name} <span className="text-muted-foreground">en «{row.themeLabel}»</span>
                  </span>
                  <Button variant="outline" className="min-h-[44px]" disabled={busy === `volver-${row.themeKey}|${row.productId}`} onClick={() => restore(row.themeKey, row.productId)}>
                    Volver a sugerir
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        </SectionCard>
      )}

      {data.licenses.length > 0 && (
        <SectionCard id="licencias" title="Revisar licencia" description="Parecen de personaje o de una marca de otra empresa. No entran en las sugerencias hasta que los permitas.">
          <ul className="flex flex-col divide-y rounded-md border bg-white">
            {data.licenses.map((row) => (
              <li key={row.productId} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">Detectado: {row.term}</p>
                </div>
                <label htmlFor={`licencia-${row.productId}`} className="flex min-h-[44px] shrink-0 items-center gap-2 text-sm">
                  <Switch id={`licencia-${row.productId}`} checked={row.allowed} disabled={busy === `licencia-${row.productId}`} onCheckedChange={(value) => toggleLicense(row.productId, value === true)} />
                  Permitir en cápsulas
                </label>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </>
  );
}
