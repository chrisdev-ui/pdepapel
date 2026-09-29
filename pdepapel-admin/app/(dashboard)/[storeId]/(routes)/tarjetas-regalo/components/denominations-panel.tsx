"use client";

import axios from "axios";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { Switch } from "@/components/ui/switch";
import { TintBadge } from "@/components/ui/tint-badge";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { DEFAULT_GIFT_CARD_DENOMINATIONS } from "@/lib/gift-card-defaults";
import { currencyFormatter } from "@/lib/utils";

import type { GiftCardDenominationRow } from "../server/get-gift-cards";

interface DenominationsPanelProps {
  storeId: string;
  rows: GiftCardDenominationRow[];
  canWrite: boolean;
}

/**
 * Los valores que la tienda ofrece en /tarjeta-regalo. Sin filas se venden
 * los tres por defecto; en cuanto Paula agrega uno, manda su lista.
 */
export function DenominationsPanel({ storeId, rows, canWrite }: DenominationsPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const usingDefaults = rows.length === 0;

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await action();
      router.refresh();
      toast({ description: success, variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const add = () =>
    run(
      "add",
      async () => {
        await axios.post(`/api/${storeId}/gift-cards/denominations`, { amount });
        setAmount("");
      },
      "Valor agregado a la tienda.",
    );

  const toggle = (row: GiftCardDenominationRow) =>
    run(
      row.id,
      () => axios.patch(`/api/${storeId}/gift-cards/denominations/${row.id}`, { isActive: !row.isActive }),
      row.isActive ? "Valor retirado de la tienda." : "Valor de vuelta en la tienda.",
    );

  const remove = async (row: GiftCardDenominationRow) => {
    const ok = await requestConfirmation({
      title: `¿Quitar ${currencyFormatter(row.amount)}?`,
      description: "Deja de ofrecerse en la tienda. Las tarjetas ya vendidas con ese valor no cambian.",
      confirmLabel: "Quitar valor",
      destructive: true,
    });
    if (!ok) return;
    await run(row.id, () => axios.delete(`/api/${storeId}/gift-cards/denominations/${row.id}`), "Valor quitado.");
  };

  return (
    <SectionCard
      id="valores"
      title="Valores a la venta"
      description={
        usingDefaults
          ? "Mientras no agregues ninguno, la tienda ofrece los tres de siempre."
          : "Lo que la clienta puede elegir en la tienda. Apaga un valor para retirarlo sin borrarlo."
      }
    >
      <ul className="flex flex-col divide-y rounded-lg border">
        {usingDefaults
          ? DEFAULT_GIFT_CARD_DENOMINATIONS.map((value) => (
              <li key={value} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="font-semibold tabular-nums">{currencyFormatter(value)}</span>
                <TintBadge label="Por defecto" tone="slate" />
              </li>
            ))
          : rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className={`font-semibold tabular-nums ${row.isActive ? "" : "text-muted-foreground line-through"}`}>
                  {currencyFormatter(row.amount)}
                </span>
                <span className="flex items-center gap-2">
                  <TintBadge label={row.isActive ? "En la tienda" : "Retirado"} tone={row.isActive ? "mint" : "slate"} />
                  {canWrite && (
                    <>
                      <Switch
                        checked={row.isActive}
                        onCheckedChange={() => toggle(row)}
                        disabled={busy === row.id}
                        aria-label={`${row.isActive ? "Retirar" : "Ofrecer"} ${currencyFormatter(row.amount)}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(row)}
                        disabled={busy === row.id}
                        aria-label={`Quitar ${currencyFormatter(row.amount)}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
      </ul>
      {canWrite && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            if (amount.trim()) void add();
          }}
        >
          <Input
            inputMode="numeric"
            placeholder="Ej: 150000"
            aria-label="Nuevo valor en pesos"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={busy === "add"}
            className="sm:max-w-[200px]"
          />
          <Button type="submit" variant="outline" disabled={busy === "add" || !amount.trim()}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Agregar valor
          </Button>
        </form>
      )}
      {confirmationDialog}
    </SectionCard>
  );
}
