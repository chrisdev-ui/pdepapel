"use client";

import { useEffect } from "react";

import { type ErrorBoundaryName, recoverFromChunkLoadError, reportBoundaryError } from "@/lib/error-reporting";

/** Lo que hace cada error boundary al montar: registrar, reportar y, si es un chunk, recargar una vez. */
export function useBoundaryError(error: Error & { digest?: string }, boundary: ErrorBoundaryName) {
  useEffect(() => {
    console.error(error);
    reportBoundaryError(error, boundary);
    recoverFromChunkLoadError(error);
  }, [error, boundary]);
}
