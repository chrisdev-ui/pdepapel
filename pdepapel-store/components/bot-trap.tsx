"use client";

import { useEffect, useRef } from "react";

import { HONEYPOT_FIELD } from "@/lib/customer-checks";

/**
 * Campo trampa y reloj del formulario para los pedidos de la tienda: el
 * servidor rechaza la trampa llena o un envío en menos de unos segundos, y
 * marca como posible bot uno muy rápido.
 */
export function useBotTrap() {
  const trapRef = useRef<HTMLInputElement>(null);
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);
  return {
    trapRef,
    fields: () => ({ website: trapRef.current?.value ?? "", formStartedAt: startedAtRef.current ?? undefined }),
  };
}

export function BotTrapField({ inputRef }: { inputRef: React.RefObject<HTMLInputElement> }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0">
      <label>
        Sitio web
        <input ref={inputRef} type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}
