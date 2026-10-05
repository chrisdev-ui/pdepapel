"use client";

import { useEffect, useState } from "react";

import { readEarlyAccessCookie } from "@/lib/early-access";

/**
 * ¿Tiene este navegador la cookie de acceso anticipado?
 *
 * Se lee en el cliente y después de hidratar, nunca en el servidor: leerla con
 * `cookies()` volvía dinámica la ficha de producto (sin caché, cada visita y
 * cada rastreo de Google pasaban por la API). El HTML cacheado siempre trae el
 * estado público («Llega pronto»); quien tiene la cookie ve el botón de compra
 * un instante después. La cookie solo decide qué botón se muestra: el checkout
 * del panel verifica el token firmado antes de vender.
 */
export function useEarlyAccess() {
  const [hasEarlyAccess, setHasEarlyAccess] = useState(false);

  useEffect(() => {
    setHasEarlyAccess(Boolean(readEarlyAccessCookie()));
  }, []);

  return hasEarlyAccess;
}
