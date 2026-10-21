"use client";

import axios from "axios";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { AsyncProductSelect } from "@/components/ui/async-product-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { EditionSuggestion } from "@/lib/capsule-suggestions";

import type { EditionListRow } from "../server/get-editions";
import { SuggestionsPanel, type SuggestionFloor } from "./suggestions-panel";

export const EDITION_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Borrador", tone: "cream" },
  PREVIEW: { label: "Vista previa", tone: "lavender" },
  LIVE: { label: "A la venta", tone: "mint" },
  CLOSED: { label: "Cerrada", tone: "slate" },
};

export function EditionsClient({ editions }: { editions: EditionListRow[] }) {
  const params = useParams<{ storeId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({ productId: "", name: "", theme: "", costBandMin: "", costBandMax: "", dailyOrderCap: "5", minMarginPct: "" });
  const [saving, setSaving] = useState(false);
  // El tema de la sugerencia usada: el taller lo recibe en `?tema=` y recalcula la misma bolsa.
  const [themeKey, setThemeKey] = useState<string | null>(null);
  const [fromSuggestion, setFromSuggestion] = useState<string | null>(null);

  const applySuggestion = (suggestion: EditionSuggestion, floor: SuggestionFloor | null) => {
    setForm((current) => ({
      ...current,
      name: suggestion.name,
      theme: suggestion.theme,
      costBandMin: String(suggestion.costBandMin),
      costBandMax: String(suggestion.costBandMax),
      minMarginPct: floor ? String(floor.value) : "",
    }));
    setThemeKey(suggestion.themeKey);
    setFromSuggestion(suggestion.name);
    document.getElementById("nueva-edicion")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const canSave = !saving && form.productId && form.name.trim() && form.theme.trim() && Number(form.costBandMin) > 0 && Number(form.costBandMax) > Number(form.costBandMin);

  const onCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { data } = await axios.post(
        `/api/${params.storeId}/capsule-editions`,
        {
          ...form,
          costBandMin: Number(form.costBandMin),
          costBandMax: Number(form.costBandMax),
          dailyOrderCap: Number(form.dailyOrderCap),
          minMarginPct: form.minMarginPct.trim() === "" ? undefined : Number(form.minMarginPct.replace(",", ".")),
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      toast({ title: `Edición #${data.edition.number} creada`, description: "Su producto quedó archivado hasta que la edición salga a la venta." });
      router.push(`/${params.storeId}/productos/ediciones/${data.edition.id}${themeKey ? `?tema=${encodeURIComponent(themeKey)}` : ""}`);
    } catch (error) {
      toast({ title: "No se creó la edición", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SuggestionsPanel onUse={applySuggestion} />

      <SectionCard id="ediciones" title="Ediciones" description="Abre una edición para armar su bolsa, sus packs e imprimir los papeles.">
        {editions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ediciones.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {editions.map((edition) => (
              <li key={edition.id}>
                <Link
                  href={`/${params.storeId}/productos/ediciones/${edition.id}`}
                  className="flex min-h-[44px] flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">#{edition.number} · {edition.name}</span>
                    <TintBadge tone={EDITION_STATUS[edition.status].tone} label={EDITION_STATUS[edition.status].label} />
                  </div>
                  <span className="text-xs text-muted-foreground">{edition.product.name}</span>
                  <span className="text-sm">
                    {edition.unsold} sin vender · {edition.slips.PRINTED} papeles impresos · {edition.slips.DRAWN} sacados · {edition.gifts.PRINTED} regalos
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        id="nueva-edicion"
        title="Nueva edición"
        description="Primero crea en Productos el producto que se va a vender (fotos, descripción, precio de una cápsula del pack de 5, sin stock). Aquí lo enlazas."
      >
        {fromSuggestion && (
          <p className="rounded-md border border-dashed bg-white p-3 text-sm" role="status">
            Datos de la sugerencia «{fromSuggestion}». Elige el producto de la edición y revisa todo: al crearla se abre el taller con la bolsa sugerida para que la revises antes de imprimir.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="edicion-producto">Producto de la edición</Label>
            <AsyncProductSelect id="edicion-producto" value={form.productId} modal="auto" ariaLabel="Producto de la edición" onChange={(productId) => setForm((current) => ({ ...current, productId }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edicion-nombre">Nombre</Label>
            <Input id="edicion-nombre" value={form.name} onChange={set("name")} maxLength={120} placeholder="Escritorio" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edicion-tema">Tema</Label>
            <Input id="edicion-tema" value={form.theme} onChange={set("theme")} maxLength={60} placeholder="escritorio" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edicion-banda-min">Costo mínimo de un papel</Label>
            <Input id="edicion-banda-min" inputMode="numeric" value={form.costBandMin} onChange={set("costBandMin")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edicion-banda-max">Costo máximo de un papel</Label>
            <Input id="edicion-banda-max" inputMode="numeric" value={form.costBandMax} onChange={set("costBandMax")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edicion-tope">Pedidos de cápsulas por día</Label>
            <Input id="edicion-tope" inputMode="numeric" value={form.dailyOrderCap} onChange={set("dailyOrderCap")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edicion-margen">Margen mínimo de la edición (%)</Label>
            <Input id="edicion-margen" inputMode="decimal" value={form.minMarginPct} onChange={set("minMarginPct")} placeholder="El de la tienda" />
          </div>
        </div>
        <div>
          <Button onClick={onCreate} disabled={!canSave} className="min-h-[44px]">
            {saving ? "Creando…" : "Crear edición"}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
