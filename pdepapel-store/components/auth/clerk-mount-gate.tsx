"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

interface ClerkMountGateProps {
  children: ReactNode;
  /** Placeholder height while hydrating, so the card does not jump. */
  minHeightClassName?: string;
}

/**
 * Clerk's script can finish loading before React hydrates, in which case the
 * first client render already contains the form while the server HTML does
 * not, and React reports a hydration mismatch. Rendering the Clerk component
 * only after mount keeps server and client output identical.
 */
export function ClerkMountGate({
  children,
  minHeightClassName = "min-h-[420px]",
}: ClerkMountGateProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div
        role="status"
        aria-label="Cargando el formulario"
        className={`flex flex-col gap-3 ${minHeightClassName}`}
      >
        <Skeleton className="h-11 w-full rounded-full" />
        <Skeleton className="h-11 w-full rounded-full" />
        <Skeleton className="h-11 w-full rounded-full" />
        <Skeleton className="mt-3 h-4 w-40" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="mt-2 h-11 w-full rounded-full" />
      </div>
    );
  }

  return <>{children}</>;
}
