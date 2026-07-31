"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { BoldCheckoutSdk } from "@/components/bold-checkout-sdk";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { BoldCheckoutPayload, toBoldCheckoutConfig } from "@/lib/bold";

interface BoldCheckoutButtonProps {
  order: {
    id: string;
    orderNumber: string;
    total: number;
  };
  storeId?: string;
  autoOpen?: boolean;
}

export const BoldCheckoutButton: React.FC<BoldCheckoutButtonProps> = ({
  order,
  storeId = "4989cec3-307b-4dbb-af4b-114e21f7e00e",
  autoOpen = false,
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isBoldSdkReady, setIsBoldSdkReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.BoldCheckout),
  );
  const [checkoutData, setCheckoutData] = useState<BoldCheckoutPayload | null>(
    null,
  );

  const fetchBoldSignature = useCallback(async () => {
    try {
      setIsLoading(true);
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:3001/api/4989cec3-307b-4dbb-af4b-114e21f7e00e";
      const baseUrl = apiUrl.split("/api/")[0];
      const res = await fetch(
        `${baseUrl}/api/${storeId}/bold/checkout/${order.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Error al preparar el pago en línea");
      }

      setCheckoutData(data);
    } catch (err: any) {
      console.error("Bold signature fetch error:", err);
      toast({
        title: "Error al iniciar pago",
        description:
          err.message || "No se pudo conectar con el servicio de pago.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [order.id, storeId, toast]);

  useEffect(() => {
    fetchBoldSignature();
  }, [fetchBoldSignature]);

  const openBoldCheckout = useCallback(() => {
    if (!checkoutData || !window.BoldCheckout) {
      toast({
        title: "Preparando pago",
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
    if (autoOpen && checkoutData && isBoldSdkReady) {
      openBoldCheckout();
    }
  }, [autoOpen, checkoutData, isBoldSdkReady, openBoldCheckout]);

  return (
    <div
      className="flex w-full flex-col items-center gap-3"
      role="region"
      aria-label="Pago en línea"
    >
      <BoldCheckoutSdk
        onReady={() => setIsBoldSdkReady(true)}
        onError={() => setIsBoldSdkReady(false)}
      />

      {(isLoading || (checkoutData && !isBoldSdkReady)) && (
        <Button
          disabled
          className="h-12 w-full rounded-xl bg-zinc-900 font-bold text-white"
        >
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {isLoading ? "Preparando pago..." : "Cargando pago..."}
        </Button>
      )}

      {!isLoading && checkoutData && isBoldSdkReady && (
        <div className="flex w-full flex-col items-center">
          <Button
            type="button"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 text-base font-bold text-white shadow-md transition-all duration-200 hover:bg-zinc-800"
            aria-label="Pagar ahora"
            onClick={openBoldCheckout}
          >
            <span>Pagar ahora</span>
            <Icons.payments.bold className="h-5 w-auto text-white" />
          </Button>

          <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Transacción 100% cifrada y protegida
          </span>
        </div>
      )}
    </div>
  );
};
