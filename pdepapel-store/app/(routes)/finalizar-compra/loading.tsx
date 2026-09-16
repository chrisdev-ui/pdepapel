import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

import { CheckoutSkeleton } from "./components/checkout-skeleton";

/**
 * Only paints on client-side navigation (cart → checkout). It mirrors the real
 * page shell so that hand-off is a swap of equals, not a reflow. The guest
 * variant is the default because this fallback cannot read the session.
 */
export default function CheckoutLoading() {
  return (
    <Container aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando finalizar compra</span>
      <div className="flex w-full flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
        <div className="order-1 sm:col-start-1 sm:row-start-1">
          <Skeleton className="h-9 w-72 sm:h-10" />
          <Skeleton className="mt-1 h-5 w-64" />
        </div>
        <div className="order-3 sm:col-start-2 sm:row-start-1 sm:min-h-[148px]" />
        <div className="order-2 sm:col-span-2 sm:row-start-2">
          <CheckoutSkeleton />
        </div>
      </div>
    </Container>
  );
}
