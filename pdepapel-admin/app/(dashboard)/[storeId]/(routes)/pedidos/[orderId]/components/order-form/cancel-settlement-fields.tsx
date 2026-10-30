"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currencyFormatter } from "@/lib/utils";
import { useEffect, useState } from "react";

/** Lo que el diálogo de cancelar necesita saber del pedido (`settlementContext`). */
export interface CancelSettlementInfo {
  prepaid: number;
  maxRetained: number;
  unfulfilled: boolean;
}

/** El cuerpo `settlement` del PATCH (`parseCancelSettlement`). */
export interface CancelSettlementBody {
  refunded: number;
  refundMethod: "BankTransfer" | "CASH" | "Bold" | "Wompi" | null;
  refundedAt: string | null;
  refundReference: string | null;
  retained: number;
  storeCredit: number;
}

const METHODS = [
  { value: "BankTransfer", label: "Transferencia o Bre-B" },
  { value: "CASH", label: "Efectivo" },
  { value: "Bold", label: "Devolución en Bold" },
  { value: "Wompi", label: "Devolución en Wompi" },
] as const;

function bogotaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

const toAmount = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
};

/**
 * Qué pasa con la plata al cancelar un pedido con anticipo: devuelto,
 * retenido (solo el anticipo, y nada si la preventa no le alcanzó) y saldo a
 * favor. Arranca con todo devuelto; `onChange` recibe null mientras no cuadre.
 */
export function CancelSettlementFields({ info, onChange }: { info: CancelSettlementInfo; onChange: (body: CancelSettlementBody | null) => void }) {
  const [refunded, setRefunded] = useState(String(info.prepaid));
  const [retained, setRetained] = useState("0");
  const [storeCredit, setStoreCredit] = useState("0");
  const [method, setMethod] = useState<CancelSettlementBody["refundMethod"]>("BankTransfer");
  const [date, setDate] = useState(bogotaToday());
  const [reference, setReference] = useState("");

  const refundedValue = toAmount(refunded);
  const retainedValue = toAmount(retained);
  const creditValue = toAmount(storeCredit);
  const total = refundedValue + retainedValue + creditValue;
  const tooMuchRetained = retainedValue > info.maxRetained;
  const balanced = total === info.prepaid;
  const valid = balanced && !tooMuchRetained && (refundedValue === 0 || Boolean(method && date));

  useEffect(() => {
    onChange(
      valid
        ? {
            refunded: refundedValue,
            refundMethod: refundedValue > 0 ? method : null,
            refundedAt: refundedValue > 0 ? (date === bogotaToday() ? new Date().toISOString() : `${date}T12:00:00-05:00`) : null,
            refundReference: reference.trim() || null,
            retained: retainedValue,
            storeCredit: creditValue,
          }
        : null,
    );
  }, [valid, refundedValue, retainedValue, creditValue, method, date, reference, onChange]);

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-3" aria-describedby="cancelar-dinero-suma">
      <legend className="px-1 text-sm font-semibold">¿Qué pasa con los {currencyFormatter(info.prepaid)} que pagó?</legend>
      {info.unfulfilled ? (
        <p className="text-xs text-muted-foreground">
          La preventa no le alcanzó a este pedido: se devuelve todo (o queda como saldo a favor). No se puede retener nada.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancelar-devuelto">Devuelto</Label>
          <Input id="cancelar-devuelto" inputMode="numeric" className="h-11" value={refunded} onChange={(event) => setRefunded(event.target.value)} />
        </div>
        {refundedValue > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancelar-medio">Por dónde lo devolviste</Label>
            <select
              id="cancelar-medio"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={method ?? ""}
              onChange={(event) => setMethod(event.target.value as CancelSettlementBody["refundMethod"])}
            >
              {METHODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {refundedValue > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancelar-fecha">Fecha de la devolución</Label>
            <Input id="cancelar-fecha" type="date" className="h-11" max={bogotaToday()} value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        ) : null}
        {refundedValue > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancelar-referencia">Referencia (opcional)</Label>
            <Input id="cancelar-referencia" className="h-11" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Comprobante de la devolución" />
          </div>
        ) : null}
        {info.maxRetained > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancelar-retenido">Retenido (anticipo no reembolsable)</Label>
            <Input
              id="cancelar-retenido"
              inputMode="numeric"
              className="h-11"
              value={retained}
              aria-invalid={tooMuchRetained}
              onChange={(event) => setRetained(event.target.value)}
            />
            <p className={tooMuchRetained ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              Hasta {currencyFormatter(info.maxRetained)}: solo el anticipo. Por retracto de ley se devuelve todo.
            </p>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancelar-saldo">Saldo a favor</Label>
          <Input id="cancelar-saldo" inputMode="numeric" className="h-11" value={storeCredit} onChange={(event) => setStoreCredit(event.target.value)} />
        </div>
      </div>
      <p id="cancelar-dinero-suma" className={balanced ? "text-xs text-muted-foreground" : "text-xs font-medium text-destructive"} aria-live="polite">
        Suman {currencyFormatter(total)} de {currencyFormatter(info.prepaid)}
        {balanced ? " · cuadra" : ": tienen que sumar exactamente lo que pagó"}
      </p>
    </fieldset>
  );
}
