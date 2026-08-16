"use client";

import { UpstreamUnavailable } from "@/components/upstream-unavailable";

export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <UpstreamUnavailable error={error} reset={reset} />;
}
