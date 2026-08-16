"use client";

import { UpstreamUnavailable } from "@/components/upstream-unavailable";

export default function CategoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <UpstreamUnavailable error={error} reset={reset} />;
}
