"use client";

import { RefreshCw, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

import { ErrorState, ErrorStateAction } from "@/components/error-state";
import { STOREFRONT_ROUTES } from "@/lib/routes";

/** Error boundary for every routed page: the root layout (header, footer, providers) is intact here. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
      tone="failure"
      icon={Wrench}
      title="Algo salió mal de nuestro lado"
      description="No es tu culpa. Tu carrito y tus datos siguen guardados; intenta de nuevo en unos segundos."
      primary={
        <ErrorStateAction onClick={retry}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Intentar de nuevo
        </ErrorStateAction>
      }
      whatsappMessage={`¡Hola! La página me mostró un error al abrir ${typeof window !== "undefined" ? window.location.pathname : "la tienda"}.${error.digest ? ` Código: ${error.digest}.` : ""}`}
      secondaryLink={{ href: STOREFRONT_ROUTES.shop, label: "Ir a la tienda" }}
      digest={error.digest}
    />
  );
}
