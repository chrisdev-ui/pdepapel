"use client";

import { useEffect } from "react";

import { isAccountGroupPath } from "@/lib/routes";

const RELOAD_FLAG = "pdepapel:clerk-full-reload";

/** Destino dentro de la tienda pero fuera de iniciar sesión, crear cuenta y Mi cuenta. */
function leavesAccountGroup(href: string): URL | null {
  const url = new URL(href, window.location.href);
  return url.origin === window.location.origin && !isAccountGroupPath(url.pathname) ? url : null;
}

/**
 * Las páginas de la cuenta llevan Clerk completo y el resto de la tienda el
 * headless, cada uno en su layout. Pasar de un grupo al otro sin recargar
 * remonta la cabecera y los proveedores: se descarga el otro Clerk y se pierde
 * el page_view de GA4. Por eso entrar y salir de la cuenta es siempre una carga
 * completa:
 * - al entrar sin recarga (el Clerk cargado es headless), se recarga una vez;
 * - al salir, los clics en enlaces cargan la página; las salidas por código
 *   (buscador, redirección de Clerk tras iniciar sesión) las recarga
 *   `HeadlessClerkGuard` al llegar.
 */
export function FullClerkGuard() {
  useEffect(() => {
    const script = document.querySelector<HTMLScriptElement>("script[data-clerk-js-script]");
    let flag: string | null = null;
    try {
      flag = window.sessionStorage.getItem(RELOAD_FLAG);
    } catch {}
    if (script?.src.includes(".headless.")) {
      if (flag !== window.location.pathname) {
        try {
          window.sessionStorage.setItem(RELOAD_FLAG, window.location.pathname);
          window.location.reload();
          return;
        } catch {}
      }
    } else if (flag) {
      try {
        window.sessionStorage.removeItem(RELOAD_FLAG);
      } catch {}
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      if (anchor.getAttribute("href")?.startsWith("#")) return;
      const url = leavesAccountGroup(anchor.href);
      if (!url) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(url.href);
    };
    window.addEventListener("click", onClick, true);

    return () => window.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
