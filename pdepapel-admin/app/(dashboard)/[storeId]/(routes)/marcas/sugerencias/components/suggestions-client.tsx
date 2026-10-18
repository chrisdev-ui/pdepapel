"use client";

import axios from "axios";
import { ArrowLeft, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { brandsApi, highlightTerm, plural, selectAllState, suggestionsHeading } from "@/lib/brand-admin";
import type { BrandSuggestion } from "@/lib/brands";
import { cn } from "@/lib/utils";

import { BrandLogoTile } from "../../components/brand-logo-tile";
import type { SuggestionBrandTab } from "../server/get-suggestion-brands";

type Conflict = BrandSuggestion & { currentBrandName: string };

interface SuggestionsResponse {
  brand: { id: string; name: string };
  clean: BrandSuggestion[];
  conflicts: Conflict[];
}

const VISIBLE_ROWS = 8;

const fetcher = (url: string) => axios.get<SuggestionsResponse>(url).then((response) => response.data);

function Highlighted({ text, term }: { text: string; term: string }) {
  return (
    <>
      {highlightTerm(text, term).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded bg-amber-100 px-0.5 text-primary">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function SuggestionRow({
  row,
  checked,
  onToggle,
  note,
  tone = "default",
}: {
  row: BrandSuggestion;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  note: string;
  tone?: "default" | "conflict";
}) {
  return (
    <li>
      <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-primary"
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-muted">
          {row.imageUrl && <Image src={row.imageUrl} alt="" fill sizes="48px" className="object-cover" />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm text-primary">
            <Highlighted text={row.name} term={row.term} />
          </span>
          <span className={cn("text-xs", tone === "conflict" ? "text-amber-900" : "text-muted-foreground")}>{note}</span>
        </span>
      </label>
    </li>
  );
}

function SelectAll({
  ids,
  selected,
  onChange,
  label,
}: {
  ids: string[];
  selected: Set<string>;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const state = selectAllState(ids, selected);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b pb-2 font-semibold text-primary">
      <input
        ref={ref}
        type="checkbox"
        className="h-5 w-5 accent-primary"
        checked={state === true}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

interface SuggestionsClientProps {
  brands: SuggestionBrandTab[];
  initialBrandId: string | null;
}

export default function SuggestionsClient({ brands, initialBrandId }: SuggestionsClientProps) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const [brandId, setBrandId] = useState<string | null>(
    brands.find((brand) => brand.id === initialBrandId)?.id ?? brands[0]?.id ?? null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
    brandId ? `${brandsApi(storeId)}/${brandId}/suggestions` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    setSelected(new Set(data?.clean.map((row) => row.id) ?? []));
    setShowAll(false);
  }, [data]);

  const tab = brands.find((brand) => brand.id === brandId) ?? null;
  const clean = useMemo(() => data?.clean ?? [], [data]);
  const conflicts = useMemo(() => data?.conflicts ?? [], [data]);
  const cleanIds = useMemo(() => clean.map((row) => row.id), [clean]);
  const visibleClean = showAll ? clean : clean.slice(0, VISIBLE_ROWS);
  const hidden = clean.length - visibleClean.length;
  const chosen = [...clean, ...conflicts].filter((row) => selected.has(row.id));
  const touchesGroup = chosen.some((row) => row.productGroupId);
  const brandName = data?.brand.name ?? tab?.name ?? "";

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleAll = (checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of cleanIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const onAssign = async () => {
    if (!brandId || chosen.length === 0) return;
    try {
      setAssigning(true);
      const { data: result } = await axios.post<{ updatedProducts: number }>(`${brandsApi(storeId)}/assign`, {
        brandId,
        productIds: chosen.map((row) => row.id),
        preview: false,
      });
      toast({
        description: `${plural(result.updatedProducts, "producto ahora es", "productos ahora son")} de ${brandName}.`,
        variant: "success",
      });
      await mutate();
      router.refresh();
    } catch (assignError) {
      toast({ title: "No se pudo asignar la marca", description: getErrorMessage(assignError), variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Button asChild variant="outline" size="icon" className="h-11 w-11 shrink-0">
          <Link href={`/${storeId}/marcas`} aria-label="Volver a Marcas">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Sugerencias automáticas</h1>
          <p className="text-sm text-muted-foreground">
            Productos activos cuyo nombre dice una marca o uno de sus alias. Nada cambia hasta que confirmes.
          </p>
        </div>
      </div>

      {brands.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          No hay sugerencias: ningún producto activo dice el nombre o un alias de una marca que no tenga ya.{" "}
          <Link href={`/${storeId}/marcas`} className="font-semibold text-primary underline">
            Volver a Marcas
          </Link>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Marca" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {brands.map((brand) => {
              const active = brand.id === brandId;
              return (
                <button
                  key={brand.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setBrandId(brand.id)}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-white text-primary hover:bg-muted",
                  )}
                >
                  {brand.name}
                  <span className="rounded-full bg-tint-lavender px-2 py-0.5 text-xs tabular-nums text-primary">
                    {brand.clean}
                    <span className="sr-only"> sugerencias</span>
                  </span>
                </button>
              );
            })}
          </div>

          <section aria-live="polite" className="flex flex-col gap-4 rounded-xl border bg-white p-4 sm:p-5">
            {isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Buscando productos…
              </p>
            ) : error ? (
              <div className="flex flex-col items-start gap-2 text-sm">
                <p className="text-red-700">No se pudieron cargar las sugerencias: {getErrorMessage(error)}</p>
                <Button variant="outline" className="min-h-11" onClick={() => void mutate()}>
                  Reintentar
                </Button>
              </div>
            ) : data ? (
              <>
                <div className="flex items-center gap-3">
                  <BrandLogoTile logoUrl={tab?.logoUrl ?? null} size="sm" className="h-12 w-14" />
                  <h2 className="text-base font-bold text-primary">{suggestionsHeading(brandName, clean)}</h2>
                </div>

                {clean.length > 0 ? (
                  <div className="flex flex-col">
                    <SelectAll ids={cleanIds} selected={selected} onChange={toggleAll} label={`Todos (${clean.length})`} />
                    <ul className="divide-y">
                      {visibleClean.map((row) => (
                        <SuggestionRow
                          key={row.id}
                          row={row}
                          checked={selected.has(row.id)}
                          onToggle={(checked) => toggle(row.id, checked)}
                          note={row.reason}
                        />
                      ))}
                    </ul>
                    {hidden > 0 && (
                      <Button variant="link" className="min-h-11 w-fit px-1 text-primary underline" onClick={() => setShowAll(true)}>
                        Ver los {hidden} restantes
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Ningún producto sin marca dice «{brandName}» ni sus alias.</p>
                )}

                {conflicts.length > 0 && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm text-amber-900">
                      <strong>
                        {conflicts.length === 1
                          ? "1 más ya tiene otra marca."
                          : `${conflicts.length} más dicen «${brandName}» pero ya tienen otra marca.`}
                      </strong>{" "}
                      No cambian a menos que los marques.
                    </p>
                    <ul className="mt-2 divide-y divide-amber-200">
                      {conflicts.map((row) => (
                        <SuggestionRow
                          key={row.id}
                          row={row}
                          checked={selected.has(row.id)}
                          onToggle={(checked) => toggle(row.id, checked)}
                          note={`Ya es de ${row.currentBrandName}`}
                          tone="conflict"
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {touchesGroup && (
                  <p className="text-xs text-muted-foreground">En un grupo, la marca se asigna a todas sus variantes.</p>
                )}

                <div className="sticky bottom-2 z-10 rounded-xl border bg-white/95 p-3 shadow-md backdrop-blur sm:static sm:flex sm:justify-end sm:border-0 sm:p-0 sm:shadow-none">
                  <Button
                    className="min-h-12 w-full sm:w-auto"
                    disabled={chosen.length === 0}
                    isLoading={assigning}
                    loadingText="Asignando…"
                    onClick={() => void onAssign()}
                  >
                    Asignar {brandName} a {plural(chosen.length, "producto", "productos")}
                  </Button>
                </div>
              </>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
