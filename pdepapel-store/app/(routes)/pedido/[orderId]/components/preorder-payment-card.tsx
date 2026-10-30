"use client";

import axios from "axios";
import { CalendarCheck, ExternalLink, Loader2, Lock, PackageX, Truck } from "lucide-react";
import { useCallback, useState } from "react";

import { BankTransferInstructions } from "@/components/bank-transfer-instructions";
import { BoldCheckoutSdk } from "@/components/bold-checkout-sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { toBoldCheckoutConfig, type BoldCheckoutPayload } from "@/lib/bold";
import { installmentProblem, parsePesos } from "@/lib/preorder-online-payment";
import { PREORDER_PAY_COPY as COPY } from "@/lib/preorder-payment-copy";
import { publicEnv as env } from "@/lib/public-env";
import { currencyFormatter } from "@/lib/utils";
import type { Order, PreorderPaymentInfo } from "@/types";

type OnlineMethod = "Bold" | "Wompi";
type ChargeResponse = (BoldCheckoutPayload & { method: "Bold" }) | { method: "Wompi"; url: string };

async function requestCharge(orderId: string, mode: "installment" | "balance", amount: number, method: OnlineMethod) {
  const { data } = await axios.post<ChargeResponse>(`${env.NEXT_PUBLIC_API_URL}/checkout/${orderId}/preorder-payment`, { mode, amount, method });
  return data;
}

const errorMessage = (error: unknown) => {
  const data = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return data?.error || data?.message || COPY.errorFallback;
};

/**
 * «Abonar» y «Pagar saldo» en `/pedido`. Lo que se puede pagar (y cuánto) lo
 * manda la administración en `preorderPayment`; aquí solo se elige el valor
 * del abono y el medio. El pago en línea abre la pasarela de siempre; la
 * transferencia muestra los datos de la cuenta con ese valor.
 */
export function PreorderPaymentCard({ order, info }: { order: Pick<Order, "id" | "orderNumber" | "fullName">; info: PreorderPaymentInfo }) {
  const { toast } = useToast();
  const [raw, setRaw] = useState(info.mode === "installment" ? "" : String(info.amountDue));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<OnlineMethod | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [sdkReady, setSdkReady] = useState(() => typeof window !== "undefined" && Boolean(window.BoldCheckout));

  const amount = info.mode === "balance" ? info.amountDue : parsePesos(raw);
  const problem = info.mode === "installment" ? installmentProblem(info, amount) : null;

  const pay = useCallback(
    async (method: OnlineMethod) => {
      if (!info.mode || amount === null || problem) {
        setTouched(true);
        return;
      }
      setBusy(method);
      try {
        const charge = await requestCharge(order.id, info.mode, amount, method);
        if (charge.method === "Wompi") {
          window.location.href = charge.url;
          return;
        }
        if (!window.BoldCheckout) throw new Error("sdk");
        new window.BoldCheckout(toBoldCheckoutConfig(charge)).open();
        setBusy(null);
      } catch (error) {
        setBusy(null);
        if (method === "Bold" && (error as Error)?.message === "sdk") {
          // La ventana de pago no cargó: la otra pasarela abre en su propia página.
          void pay("Wompi");
          return;
        }
        toast({ title: COPY.errorTitle, description: errorMessage(error), variant: "destructive" });
      }
    },
    [amount, info.mode, order.id, problem, toast],
  );

  if (info.unfulfilled) {
    return (
      <div role="status" data-testid="preorder-unfulfilled" className="flex flex-col gap-1.5 rounded-xl border border-kawaii-pink bg-kawaii-pink-light/60 p-3 text-sm text-rose-950">
        <p className="flex items-center gap-2 font-sans text-base font-bold">
          <PackageX aria-hidden="true" className="h-4 w-4 shrink-0" />
          {COPY.unfulfilledTitle}
        </p>
        <p>{COPY.unfulfilledBody}</p>
      </div>
    );
  }

  if (!info.mode) {
    if (info.block !== "awaiting-balance-request") return null;
    return (
      <div role="status" data-testid="preorder-awaiting-balance" className="flex items-start gap-2 rounded-xl border border-kawaii-blue bg-kawaii-blue-light/60 p-3 text-sm text-sky-950">
        <Truck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{COPY.waitingForShipping}</p>
      </div>
    );
  }

  const isBalance = info.mode === "balance";
  const payable = amount !== null && !problem ? amount : null;

  return (
    <section aria-labelledby="pagar-preventa-titulo" data-testid="preorder-pay-card" className="flex flex-col gap-3 rounded-xl border border-kawaii-mint bg-kawaii-mint-light/40 p-3 print:hidden">
      <BoldCheckoutSdk onReady={() => setSdkReady(true)} onError={() => setSdkReady(false)} />
      <h3 id="pagar-preventa-titulo" className="flex items-center gap-2 font-sans text-base font-bold text-emerald-950">
        <CalendarCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
        {isBalance ? COPY.balanceTitle : COPY.installmentTitle}
      </h3>
      <p className="text-sm text-emerald-950" data-testid="preorder-pay-help">
        {isBalance ? COPY.balanceHelp(info.amountDue) : COPY.installmentHelp(info.minAmount, info.amountDue)}
      </p>

      {!isBalance && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="abono-valor">{COPY.installmentLabel}</Label>
          <Input
            id="abono-valor"
            inputMode="numeric"
            autoComplete="off"
            placeholder={currencyFormatter.format(info.minAmount)}
            value={raw}
            aria-invalid={touched && Boolean(problem)}
            aria-describedby={touched && problem ? "abono-error" : undefined}
            onChange={(event) => setRaw(event.target.value)}
            onBlur={() => setTouched(true)}
            className="h-11 bg-white text-base"
          />
          {touched && problem && (
            <p id="abono-error" role="alert" className="text-sm font-medium text-destructive">
              {problem}
            </p>
          )}
        </div>
      )}

      <Button
        type="button"
        className="h-12 w-full gap-2 rounded-xl bg-zinc-900 text-base font-bold text-white hover:bg-zinc-800"
        disabled={busy !== null}
        onClick={() => (sdkReady ? void pay("Bold") : void pay("Wompi"))}
        data-testid="preorder-pay-online"
      >
        {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Lock aria-hidden="true" className="h-4 w-4" />}
        {busy ? COPY.preparing : COPY.payOnline(payable ?? (isBalance ? info.amountDue : null))}
      </Button>
      <Button type="button" variant="outline" className="h-11 w-full gap-2 rounded-xl" disabled={busy !== null} onClick={() => void pay("Wompi")}>
        <ExternalLink aria-hidden="true" className="h-4 w-4" />
        {COPY.otherGateway}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-11 w-full rounded-xl font-semibold text-blue-yankees"
        aria-expanded={showTransfer}
        onClick={() => {
          if (!isBalance && problem) {
            setTouched(true);
            return;
          }
          setShowTransfer((value) => !value);
        }}
      >
        {COPY.payByTransfer}
      </Button>
      {showTransfer && payable !== null && (
        <div data-testid="preorder-transfer" className="flex flex-col gap-2">
          <BankTransferInstructions order={{ id: order.id, orderNumber: order.orderNumber, total: payable, fullName: order.fullName }} compact />
          <p className="text-xs text-muted-foreground">{COPY.transferNote}</p>
        </div>
      )}
    </section>
  );
}
