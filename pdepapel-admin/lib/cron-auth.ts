import { NextResponse } from "next/server";

import { env } from "@/lib/env.mjs";
import { CACHE_HEADERS } from "@/lib/utils";
import { safeSecretEquals } from "@/lib/webhook-auth";

export function isCronRequest(request: Request): boolean {
  const token = request.headers.get("authorization")?.split("Bearer ").at(1);
  return safeSecretEquals(token, env.CRON_SECRET);
}

/**
 * Corre antes de cualquier escritura en JobRun: una llamada sin el secreto
 * del cron no debe dejar una fila «Falló» en Sistemas ni pisar la última
 * corrida real. Devuelve la respuesta 403 lista, o null si el secreto vale.
 */
export function requireCronAuth(
  request: Request,
  headers: HeadersInit = CACHE_HEADERS.NO_CACHE,
): NextResponse | null {
  if (isCronRequest(request)) return null;
  return NextResponse.json(
    { error: "No tienes permisos para esta acción" },
    { status: 403, headers },
  );
}
