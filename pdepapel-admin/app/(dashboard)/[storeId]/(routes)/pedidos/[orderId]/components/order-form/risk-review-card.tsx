"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RISK_REASON_LABELS, isFlagged, parseRiskReasons } from "@/lib/order-risk";

import { SectionCard } from "./section-card";

interface RiskReviewCardProps {
  storeId: string;
  order: { id: string; riskScore: number; riskReasons: string | null; giftCardReview: string | null };
  className?: string;
}

/** «Posible bot» y la decisión sobre una tarjeta de regalo pagada que espera revisión. */
export function RiskReviewCard({ storeId, order, className }: RiskReviewCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const [busy, setBusy] = useState(false);
  const reasons = parseRiskReasons(order.riskReasons);
  const flagged = isFlagged(order) || reasons.includes("pago-en-cancelado");
  const fraudConfirmed = reasons.includes("fraude-confirmado");
  const pending = order.giftCardReview === "PENDING";
  const rejected = order.giftCardReview === "REJECTED";
  if (!flagged && !pending && !rejected) return null;

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/${storeId}/orders/${order.id}/gift-card-review`, { decision });
      toast(
        decision === "reject"
          ? { title: "Tarjeta rechazada", description: "No se emitió el código. Si el pago entró, devuélvelo desde la pasarela." }
          : data?.delivered
            ? { title: "Tarjeta aprobada y enviada", description: "El código salió por correo." }
            : {
                title: "Tarjeta aprobada, pero el correo no salió",
                description: "Usa «Reenviar correo» en Tarjetas de regalo para mandar un código nuevo.",
                variant: "destructive",
              },
      );
      router.refresh();
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast({ title: "No se pudo guardar la decisión", description: message || "Intenta de nuevo.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard id="revision-riesgo" title={fraudConfirmed ? "Cancelado como fraude o bot" : isFlagged(order) ? "⚠️ Posible bot" : flagged ? "Pago por revisar" : "Tarjeta de regalo"} tone="care" className={className}>
      {flagged && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-muted-foreground">Señales de este pedido:</p>
          <ul className="list-disc pl-5">
            {reasons.map((reason) => (
              <li key={reason}>{RISK_REASON_LABELS[reason]}</li>
            ))}
          </ul>
        </div>
      )}
      {pending && (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            <strong>Tarjeta en revisión.</strong> El pago está confirmado, pero el código no sale hasta que decidas.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" disabled={busy || !canWrite} onClick={() => decide("approve")}>
              Aprobar y enviar tarjeta
            </Button>
            <Button type="button" variant="outline" disabled={busy || !canWrite} onClick={() => decide("reject")}>
              Rechazar (no enviar código)
            </Button>
          </div>
        </div>
      )}
      {rejected && <p className="text-sm text-muted-foreground">Rechazaste esta tarjeta: el código no se emitió.</p>}
    </SectionCard>
  );
}
