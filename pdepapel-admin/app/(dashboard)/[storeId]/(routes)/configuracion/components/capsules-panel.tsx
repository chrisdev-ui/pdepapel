"use client";

import axios from "axios";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";

interface TemplateRow {
  packSize: number;
  giftMaxCost: number;
  giftMaxItems: number;
  giftLabel: string | null;
  boxReserveCost: number;
}

export interface CapsuleSettingsData {
  minSlipCost: number | null;
  template: TemplateRow[];
  activeSource: { source: "edition" | "template"; edition: { number: number; name: string } | null } | null;
}

type RowForm = { giftMaxCost: string; giftMaxItems: string; giftLabel: string; boxReserveCost: string };

const toForm = (rows: TemplateRow[]): Record<number, RowForm> =>
  Object.fromEntries(
    CAPSULE_PACK_PRICES.map((price) => {
      const row = rows.find((item) => item.packSize === price.packSize);
      return [price.packSize, { giftMaxCost: String(row?.giftMaxCost ?? 0), giftMaxItems: String(row?.giftMaxItems ?? 0), giftLabel: row?.giftLabel ?? "", boxReserveCost: String(row?.boxReserveCost ?? 0) }];
    }),
  );

const digits = (value: string) => Number(value.replace(/[.\s]/g, "")) || 0;

/**
 * Lo que necesitan las ediciones sugeridas: el piso de costo de un papel y,
 * mientras no haya una edición con packs guardados, la plantilla de packs.
 */
export function CapsulesPanel({ initial }: { initial: CapsuleSettingsData }) {
  const params = useParams<{ storeId: string }>();
  const [minSlipCost, setMinSlipCost] = useState(initial.minSlipCost === null ? "" : String(initial.minSlipCost));
  const [rows, setRows] = useState(() => toForm(initial.template));
  const [active, setActive] = useState(initial.activeSource);
  const [saving, setSaving] = useState(false);
  const set = (packSize: number, field: keyof RowForm) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setRows((current) => ({ ...current, [packSize]: { ...current[packSize], [field]: event.target.value } }));

  const save = async () => {
    try {
      setSaving(true);
      const { data } = await axios.put(`/api/${params.storeId}/capsule-settings`, {
        minSlipCost: minSlipCost.trim() === "" ? null : digits(minSlipCost),
        template: CAPSULE_PACK_PRICES.map((price) => ({
          packSize: price.packSize,
          giftMaxCost: digits(rows[price.packSize].giftMaxCost),
          giftMaxItems: Number(rows[price.packSize].giftMaxItems) || 0,
          giftLabel: rows[price.packSize].giftLabel,
          boxReserveCost: digits(rows[price.packSize].boxReserveCost),
        })),
      });
      setRows(toForm(data.template));
      setActive(data.activeSource);
      toast({ description: "Ajustes de cápsulas guardados", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "warning" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <Heading
        title="Cápsulas: ediciones sugeridas"
        description="El panel sugiere ediciones con productos quietos. Aquí van el costo mínimo de un papel y los packs que usa para medir el margen. Solo la dueña los ve."
      />
      <div className="grid max-w-sm gap-2">
        <Label htmlFor="capsula-papel-minimo">Costo mínimo de un papel (pesos)</Label>
        <Input id="capsula-papel-minimo" inputMode="numeric" className="h-11" value={minSlipCost} onChange={(event) => setMinSlipCost(event.target.value)} placeholder="Sin mínimo" />
        <p className="text-xs text-muted-foreground">Lo más barato no se sugiere como papel: queda para regalo.</p>
      </div>
      <p className="text-sm">
        {active?.source === "edition" && active.edition
          ? `Hoy las sugerencias usan los packs de la edición #${active.edition.number} · ${active.edition.name}, la más reciente con packs guardados. Esta plantilla se usa cuando no hay ninguna.`
          : active?.source === "template"
            ? "Hoy las sugerencias usan esta plantilla: todavía no hay una edición con packs guardados."
            : "Llena la plantilla para ver ediciones sugeridas: todavía no hay una edición con packs guardados de dónde copiarlos."}
      </p>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Plantilla de packs</legend>
        {CAPSULE_PACK_PRICES.map((price) => (
          <div key={price.packSize} className="grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-2 lg:grid-cols-[6rem_1fr_1fr_2fr_1fr] lg:items-end">
            <p className="text-sm font-semibold lg:pb-3">Pack de {price.packSize}</p>
            <div className="grid gap-1">
              <Label htmlFor={`plantilla-${price.packSize}-tope`}>Tope del regalo</Label>
              <Input id={`plantilla-${price.packSize}-tope`} inputMode="numeric" className="h-11" value={rows[price.packSize].giftMaxCost} onChange={set(price.packSize, "giftMaxCost")} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`plantilla-${price.packSize}-regalos`}>Regalos (0 a 5)</Label>
              <Input id={`plantilla-${price.packSize}-regalos`} inputMode="numeric" className="h-11" value={rows[price.packSize].giftMaxItems} onChange={set(price.packSize, "giftMaxItems")} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`plantilla-${price.packSize}-texto`}>Texto del regalo</Label>
              <Input id={`plantilla-${price.packSize}-texto`} className="h-11" maxLength={120} value={rows[price.packSize].giftLabel} onChange={set(price.packSize, "giftLabel")} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`plantilla-${price.packSize}-caja`}>Caja y empaque</Label>
              <Input id={`plantilla-${price.packSize}-caja`} inputMode="numeric" className="h-11" value={rows[price.packSize].boxReserveCost} onChange={set(price.packSize, "boxReserveCost")} />
            </div>
          </div>
        ))}
      </fieldset>
      <div>
        <Button className="min-h-[44px]" disabled={saving} onClick={save}>
          {saving ? "Guardando…" : "Guardar ajustes de cápsulas"}
        </Button>
      </div>
    </section>
  );
}
