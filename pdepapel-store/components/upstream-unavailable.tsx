"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

import { ErrorState, ErrorStateAction } from "@/components/error-state";
import { STOREFRONT_ROUTES } from "@/lib/routes";

interface UpstreamUnavailableProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for pages that read the admin API on the server (product,
 * category, order): the shop is fine, the data did not arrive this time.
 */
export function UpstreamUnavailable({ error, reset }: UpstreamUnavailableProps) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // A plain reset() re-renders the segment with the stale server payload;
  // refreshing first re-fetches it, which is what actually recovers the page.
  const retry = () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <ErrorState
      tone="retry"
      icon={CloudOff}
      title="Estamos actualizando la tienda"
      description="No pudimos cargar esta información por un momento. Tu carrito no se modificó; vuelve a intentarlo en unos segundos."
      primary={
        <ErrorStateAction onClick={retry}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Reintentar
        </ErrorStateAction>
      }
      whatsappMessage={`¡Hola! Una página de la tienda no cargó (${typeof window !== "undefined" ? window.location.pathname : "producto"}). ¿Sigue disponible?`}
      secondaryLink={{ href: STOREFRONT_ROUTES.shop, label: "Ver la tienda" }}
      digest={error.digest}
    />
  );
}
