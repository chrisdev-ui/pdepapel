"use client";

import { UpstreamUnavailable } from "@/components/upstream-unavailable";

export default function OrderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <UpstreamUnavailable error={error} reset={reset} />;
}
