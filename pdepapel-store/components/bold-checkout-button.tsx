"use client";

import { useEffect, useState, useCallback } from "react";
import Script from "next/script";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";

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
  const [checkoutData, setCheckoutData] = useState<{
    identityKey: string;
    integritySignature: string;
    amount: number;
    currency: string;
    orderNumber: string;
    redirectionUrl: string;
    description: string;
  } | null>(null);

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
        throw new Error(data.message || "Error al preparar el pago con Bold");
      }

      setCheckoutData(data);
    } catch (err: any) {
      console.error("Bold signature fetch error:", err);
      toast({
        title: "Error al iniciar pago",
        description:
          err.message || "No se pudo conectar con el servidor de Bold.",
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
    if (!checkoutData) return;

    if (typeof window !== "undefined" && (window as any).BoldCheckout) {
      try {
        const boldCheckout = new (window as any).BoldCheckout({
          orderId: checkoutData.orderNumber,
          currency: checkoutData.currency,
          amount: String(checkoutData.amount),
          apiKey: checkoutData.identityKey,
          integritySignature: checkoutData.integritySignature,
          description: checkoutData.description,
          redirectionUrl: checkoutData.redirectionUrl,
        });
        boldCheckout.open();
      } catch (err) {
        console.error("Error opening Bold checkout:", err);
      }
    } else {
      console.warn("BoldCheckout SDK not yet loaded");
    }
  }, [checkoutData]);

  useEffect(() => {
    if (autoOpen && checkoutData) {
      openBoldCheckout();
    }
  }, [autoOpen, checkoutData, openBoldCheckout]);

  return (
    <div
      className="flex flex-col items-center gap-3 w-full"
      role="region"
      aria-label="Pasarela de pago Bold"
    >
      <Script
        src="https://checkout.bold.co/library/boldPaymentButton.js"
        strategy="lazyOnload"
      />

      {isLoading && (
        <Button
          disabled
          className="w-full h-12 rounded-xl bg-zinc-900 text-white font-bold"
        >
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Preparando pasarela de Bold...
        </Button>
      )}

      {!isLoading && checkoutData && (
        <div className="w-full flex flex-col items-center">
          <Button
            type="button"
            className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2 text-base transition-all duration-200"
            aria-label="Pagar con Bold"
            onClick={openBoldCheckout}
          >
            <span>Pagar con</span>
            <Icons.payments.bold className="h-5 w-auto text-white" />
          </Button>

          <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Transacción 100% cifrada y protegida por Bold Colombia
          </span>
        </div>
      )}
    </div>
  );
};
