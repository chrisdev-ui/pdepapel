"use client";

import { useEffect } from "react";

const RELOAD_FLAG = "pdepapel:clerk-headless-reload";

/**
 * Pareja de `FullClerkGuard` en las páginas públicas: si aquí hay un Clerk
 * completo cargado, se llegó sin recarga desde la cuenta (el buscador de la
 * cabecera, la redirección de Clerk al iniciar sesión). Se recarga una vez para
 * que la página tenga su Clerk sin interfaz y su page_view.
 */
export function HeadlessClerkGuard() {
  useEffect(() => {
    const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[data-clerk-js-script]"));
    if (!scripts.some((script) => script.src && !script.src.includes(".headless."))) return;
    const here = window.location.pathname + window.location.search;
    try {
      if (window.sessionStorage.getItem(RELOAD_FLAG) === here) return;
      window.sessionStorage.setItem(RELOAD_FLAG, here);
    } catch {
      return;
    }
    window.location.reload();
  }, []);
  return null;
}
