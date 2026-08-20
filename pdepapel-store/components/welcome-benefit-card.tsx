"use client";

import { useAuth } from "@clerk/nextjs";
import { Gift, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { getWelcomeBenefit, WelcomeBenefit } from "@/actions/get-welcome-benefit";
import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { trackCustomerEvent } from "@/lib/customer-analytics";

function getBenefitLabel(benefit: WelcomeBenefit) {
  if (benefit.type === "PERCENTAGE") return `${benefit.amount}% de descuento`;
  return (
    <>
      descuento de <Currency value={benefit.amount} />
    </>
  );
}

export function WelcomeBenefitCard({
  onApply,
  isApplying,
}: {
  onApply: (code: string) => void;
  isApplying: boolean;
}) {
  const { getToken, isLoaded, userId } = useAuth();
  const [benefit, setBenefit] = useState<WelcomeBenefit | null>(null);

  useEffect(() => {
    if (!isLoaded || !userId) {
      setBenefit(null);
      return;
    }

    let isCurrent = true;

    const loadBenefit = async () => {
      try {
        const sessionToken = await getToken();
        if (!sessionToken) return;
        const response = await getWelcomeBenefit(sessionToken);
        if (isCurrent) setBenefit(response);
      } catch {
        if (isCurrent) setBenefit(null);
      }
    };

    void loadBenefit();
    return () => {
      isCurrent = false;
    };
  }, [getToken, isLoaded, userId]);

  if (!benefit) return null;

  return (
    <aside className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-pink-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Gift className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">
              Beneficio de bienvenida: {getBenefitLabel(benefit)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Úsalo en tu primera compra con esta cuenta.
              {benefit.minOrderValue && benefit.minOrderValue > 0
                ? " Aplica desde "
                : ""}
              {benefit.minOrderValue && benefit.minOrderValue > 0 ? (
                <Currency value={benefit.minOrderValue} />
              ) : null}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={isApplying}
          onClick={() => {
            trackCustomerEvent("welcome_benefit_apply_clicked", {
              source: "checkout_review",
              benefit_type: benefit.type,
            });
            onApply(benefit.code);
          }}
        >
          {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
        </Button>
      </div>
    </aside>
  );
}
