"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Clerk's script can finish loading before React hydrates, in which case the
 * first client render already contains the form while the server HTML does
 * not, and React reports a hydration mismatch. Rendering the Clerk component
 * only after mount keeps server and client output identical.
 */
export function ClerkMountGate({ children }: { children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div role="status" aria-label="Cargando el formulario" className="flex min-h-[360px] flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="mt-3 h-4 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="mt-2 h-10 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
