"use client";

import { useAuth } from "@clerk/nextjs";
import { CheckCircle2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  claimOrderForAccount,
  prepareOrderAccountClaim,
} from "@/actions/order-account-claim";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  getOrderAccountClaimRedirectPath,
  getOrderAccountClaimStorageKey,
} from "@/lib/order-account-claim";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { trackCustomerEvent } from "@/lib/customer-analytics";

interface OrderAccountClaimCardProps {
  orderId: string;
  orderGuestId?: string | null;
  orderUserId?: string | null;
  guestId?: string | null;
}

export const OrderAccountClaimCard: React.FC<OrderAccountClaimCardProps> = ({
  orderId,
  orderGuestId,
  orderUserId,
  guestId,
}) => {
  const { getToken, isLoaded, userId } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isPreparing, setIsPreparing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isClaimed, setIsClaimed] = useState(false);
  const [hasEmailClaim, setHasEmailClaim] = useState(false);

  const isGuestOwner = Boolean(
    guestId && orderGuestId && guestId === orderGuestId && !orderUserId,
  );
  const canClaimOrder = Boolean(!orderUserId && (isGuestOwner || hasEmailClaim));

  useEffect(() => {
    const storageKey = getOrderAccountClaimStorageKey(orderId);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const emailClaimToken = hash.get("guardar-pedido");

    if (emailClaimToken && emailClaimToken.length >= 32) {
      window.sessionStorage.setItem(storageKey, emailClaimToken);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setHasEmailClaim(true);
      return;
    }

    setHasEmailClaim(Boolean(window.sessionStorage.getItem(storageKey)));
  }, [orderId]);

  useEffect(() => {
    if (!canClaimOrder || isClaimed) return;

    trackCustomerEvent("order_account_prompt_viewed", {
      source: "order_detail",
    });
  }, [canClaimOrder, isClaimed]);

  const claimPendingOrder = useCallback(async () => {
    const storageKey = getOrderAccountClaimStorageKey(orderId);
    const token = window.sessionStorage.getItem(storageKey);
    if (!token || !userId) return;

    try {
      setIsClaiming(true);
      const sessionToken = await getToken();
      if (!sessionToken) {
        throw new Error("No se encontró una sesión válida");
      }

      const result = await claimOrderForAccount({
        orderId,
        sessionToken,
        token,
      });

      window.sessionStorage.removeItem(storageKey);
      if (!result.claimed) {
        throw new Error("No se pudo guardar el pedido");
      }

      setIsClaimed(true);
      trackCustomerEvent("order_account_claimed", {
        source: hasEmailClaim ? "order_email" : "order_detail",
      });
      toast({
        title: "Pedido guardado en tu cuenta",
        description: "Ahora puedes consultarlo desde Mis pedidos cuando quieras.",
        variant: "success",
        icon: <CheckCircle2 className="h-6 w-6 text-emerald-600" />,
      });
      router.refresh();
    } catch {
      window.sessionStorage.removeItem(storageKey);
      toast({
        title: "No pudimos guardar este pedido",
        description:
          "Inicia sesión con el mismo correo usado en la compra e inténtalo de nuevo desde este dispositivo.",
        variant: "destructive",
      });
    } finally {
      setIsClaiming(false);
    }
  }, [getToken, hasEmailClaim, orderId, router, toast, userId]);

  useEffect(() => {
    if (!isLoaded || !userId || !canClaimOrder || isClaimed) return;

    void claimPendingOrder();
  }, [canClaimOrder, claimPendingOrder, isClaimed, isLoaded, userId]);

  const prepareAndRedirect = useCallback(
    async (destination: string, eventName: string) => {
      if (!guestId) return;

      try {
        setIsPreparing(true);
        const { token } = await prepareOrderAccountClaim({ orderId, guestId });
        window.sessionStorage.setItem(
          getOrderAccountClaimStorageKey(orderId),
          token,
        );
        trackCustomerEvent(eventName, { source: "order_detail" });

        window.location.assign(
          `${destination}?redirect_url=${encodeURIComponent(
            getOrderAccountClaimRedirectPath(orderId),
          )}`,
        );
      } catch {
        toast({
          title: "No pudimos preparar tu cuenta",
          description:
            "Actualiza la página y vuelve a intentarlo desde este mismo dispositivo.",
          variant: "destructive",
        });
        setIsPreparing(false);
      }
    },
    [guestId, orderId, toast],
  );

  const prepareAndClaim = useCallback(async () => {
    if (!guestId) return;

    try {
      setIsPreparing(true);
      const { token } = await prepareOrderAccountClaim({ orderId, guestId });
      window.sessionStorage.setItem(
        getOrderAccountClaimStorageKey(orderId),
        token,
      );
      trackCustomerEvent("order_account_claim_clicked", {
        source: "order_detail",
      });
      await claimPendingOrder();
    } catch {
      toast({
        title: "No pudimos guardar este pedido",
        description:
          "Actualiza la página y vuelve a intentarlo desde este mismo dispositivo.",
        variant: "destructive",
      });
    } finally {
      setIsPreparing(false);
    }
  }, [claimPendingOrder, guestId, orderId, toast]);

  if (!isLoaded || !canClaimOrder || isClaimed) return null;

  if (userId) {
    return (
      <Card className="border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif text-xl">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            Guarda este pedido en tu cuenta
          </CardTitle>
          <CardDescription>
            Tendrás el seguimiento y los detalles de tu compra en Mis pedidos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasEmailClaim ? (
            <p className="text-sm text-muted-foreground">
              {isClaiming
                ? "Estamos guardando tu pedido..."
                : "Confirma que iniciaste sesión con el mismo correo usado en la compra."}
            </p>
          ) : (
            <Button
              type="button"
              onClick={prepareAndClaim}
              disabled={isPreparing || isClaiming}
            >
              {isPreparing || isClaiming
                ? "Guardando pedido..."
                : "Guardar este pedido"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-xl">
          <UserPlus className="h-6 w-6 text-purple-600" />
          Guarda tu pedido para después
        </CardTitle>
        <CardDescription>
          Crea una cuenta gratis con Google o correo para ver este pedido,
          seguirlo y consultar futuras compras. Comprar como invitado siempre
          seguirá disponible.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          onClick={async () => {
            await prepareAndRedirect(STOREFRONT_ROUTES.signUp, "order_account_sign_up_clicked");
          }}
          disabled={isPreparing}
        >
          <UserPlus className="mr-2 h-5 w-5" />
          Crear cuenta gratis
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await prepareAndRedirect(STOREFRONT_ROUTES.signIn, "order_account_sign_in_clicked");
          }}
          disabled={isPreparing}
        >
          <LogIn className="mr-2 h-5 w-5" />
          Ya tengo cuenta
        </Button>
      </CardContent>
    </Card>
  );
};
