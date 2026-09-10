"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { checkoutByOrderId } from "@/actions/checkout-order";
import { BoldCheckoutSdk } from "@/components/bold-checkout-sdk";
import { Button } from "@/components/ui/button";
import { PaymentMethod } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { BoldCheckoutPayload, toBoldCheckoutConfig } from "@/lib/bold";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { env } from "@/lib/env.mjs";
import { resolvePaymentGateway } from "@/lib/payment-router";

interface BoldCheckoutButtonProps {
  order: {
    id: string;
    orderNumber: string;
    total: number;
  };
  storeId?: string;
  autoOpen?: boolean;
}

/** How long we wait for the payment script before offering a manual retry. */
const SDK_READY_TIMEOUT_MS = 8_000;
const SIGNATURE_TIMEOUT_MS = 15_000;

/** `NEXT_PUBLIC_API_URL` already embeds the store id: `…/api/<storeId>`. */
const resolveApi = (storeIdOverride?: string) => {
  const apiUrl = env.NEXT_PUBLIC_API_URL;
  const [baseUrl, storeSegment] = apiUrl.split("/api/");
  const storeId = storeIdOverride || storeSegment?.split("/")[0] || "";
  return { baseUrl, storeId };
};

/** The routing table names the gateway to fall back to when the default one fails. */
const FALLBACK_GATEWAY = resolvePaymentGateway(PaymentMethod.Bold).fallbackMethod;

export const BoldCheckoutButton: React.FC<BoldCheckoutButtonProps> = ({
  order,
  storeId,
  autoOpen = false,
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [isBoldSdkReady, setIsBoldSdkReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.BoldCheckout),
  );
  const [sdkTimedOut, setSdkTimedOut] = useState(false);
  const [checkoutData, setCheckoutData] = useState<BoldCheckoutPayload | null>(
    null,
  );
  const [isSwitchingGateway, setIsSwitchingGateway] = useState(false);
  const hasAutoOpenedRef = useRef(false);

  const fetchBoldSignature = useCallback(async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      SIGNATURE_TIMEOUT_MS,
    );
    try {
      setIsLoading(true);
      setSignatureError(null);
      const { baseUrl, storeId: resolvedStoreId } = resolveApi(storeId);
      const res = await fetch(
        `${baseUrl}/api/${resolvedStoreId}/bold/checkout/${order.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Error al preparar el pago en línea");
      }

      setCheckoutData(data);
    } catch (err: any) {
      console.error("Bold signature fetch error:", err);
      setSignatureError(
        err?.name === "AbortError"
          ? "La conexión con el servicio de pago tardó demasiado."
          : err?.message || "No se pudo conectar con el servicio de pago.",
      );
    } finally {
      window.clearTimeout(timer);
      setIsLoading(false);
    }
  }, [order.id, storeId]);

  useEffect(() => {
    void fetchBoldSignature();
  }, [fetchBoldSignature]);

  // If the payment script never reports ready, stop showing an endless
  // spinner and let the customer retry or switch gateway.
  useEffect(() => {
    if (isBoldSdkReady) return;
    const timer = window.setTimeout(() => {
      if (!window.BoldCheckout) setSdkTimedOut(true);
      else setIsBoldSdkReady(true);
    }, SDK_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isBoldSdkReady]);

  const openBoldCheckout = useCallback(() => {
    if (!checkoutData || !window.BoldCheckout) {
      toast({
        title: "Preparando el pago",
        description:
          "El servicio de pago se está cargando. Intenta de nuevo en unos segundos.",
      });
      return;
    }

    try {
      const boldCheckout = new window.BoldCheckout(
        toBoldCheckoutConfig(checkoutData),
      );
      boldCheckout.open();
    } catch (err) {
      console.error("Error opening Bold checkout:", err);
      toast({
        title: "No pudimos abrir el pago",
        description: "Intenta de nuevo en unos segundos.",
        variant: "destructive",
      });
    }
  }, [checkoutData, toast]);

  useEffect(() => {
    if (
      autoOpen &&
      checkoutData &&
      isBoldSdkReady &&
      !hasAutoOpenedRef.current
    ) {
      hasAutoOpenedRef.current = true;
      openBoldCheckout();
    }
  }, [autoOpen, checkoutData, isBoldSdkReady, openBoldCheckout]);

  const retryEverything = () => {
    setSdkTimedOut(false);
    if (window.BoldCheckout) setIsBoldSdkReady(true);
    void fetchBoldSignature();
  };

  /**
   * Fallback gateway: the API switches this unpaid order to the secondary
   * online gateway and returns its hosted payment link.
   */
  const payWithFallbackGateway = async () => {
    if (!FALLBACK_GATEWAY || isSwitchingGateway) return;
    setIsSwitchingGateway(true);
    try {
      const { url } = await checkoutByOrderId(order.id);
      trackCustomerEvent("checkout_payment_redirect", {
        payment_type: FALLBACK_GATEWAY,
        fallback_used: true,
      });
      window.location.href = url;
    } catch (err: any) {
      console.error("Fallback gateway error:", err);
      toast({
        title: "No pudimos abrir la otra pasarela",
        description:
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          "Intenta de nuevo en unos segundos o escríbenos por WhatsApp.",
        variant: "destructive",
      });
      setIsSwitchingGateway(false);
    }
  };

  const showRetry = Boolean(signatureError) || (sdkTimedOut && !isBoldSdkReady);
  const showPreparing =
    !showRetry && (isLoading || (checkoutData && !isBoldSdkReady));

  const fallbackButton = FALLBACK_GATEWAY ? (
    <Button
      type="button"
      variant="outline"
      onClick={() => void payWithFallbackGateway()}
      disabled={isSwitchingGateway}
      className="h-11 w-full rounded-xl"
    >
      {isSwitchingGateway ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      Pagar con otra pasarela segura
    </Button>
  ) : null;

  return (
    <div
      className="flex w-full flex-col items-center gap-3"
      role="region"
      aria-label="Pago en línea"
    >
      <BoldCheckoutSdk
        onReady={() => setIsBoldSdkReady(true)}
        onError={() => {
          setIsBoldSdkReady(false);
          setSdkTimedOut(true);
        }}
      />

      {showPreparing && (
        <Button
          disabled
          className="h-12 w-full rounded-xl bg-zinc-900 font-bold text-white"
          aria-busy="true"
        >
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          {isLoading ? "Preparando el pago…" : "Cargando el pago seguro…"}
        </Button>
      )}

      {showRetry && (
        <div
          className="flex w-full flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
          role="alert"
        >
          <p className="text-destructive">
            <strong>No pudimos preparar el pago en línea.</strong>{" "}
            {signatureError ||
              "El servicio de pago no respondió. Suele ser momentáneo."}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={retryEverything}
            className="h-11 w-full rounded-xl"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reintentar
          </Button>
          {fallbackButton}
        </div>
      )}

      {!isLoading && checkoutData && isBoldSdkReady && (
        <div className="flex w-full flex-col items-center gap-2">
          <Button
            type="button"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 text-base font-bold text-white shadow-md transition-[background-color] duration-200 hover:bg-zinc-800"
            aria-label="Pagar ahora"
            onClick={openBoldCheckout}
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            <span>Pagar ahora</span>
          </Button>

          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Transacción cifrada y protegida
          </span>
          <details className="w-full text-center text-xs text-muted-foreground">
            <summary className="cursor-pointer list-none underline underline-offset-4 [&::-webkit-details-marker]:hidden">
              ¿La ventana de pago no abre?
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <span>
                Si cerraste la ventana puedes reintentar con «Pagar ahora». Tu
                carrito sigue intacto.
              </span>
              {fallbackButton}
            </div>
          </details>
        </div>
      )}
    </div>
  );
};
