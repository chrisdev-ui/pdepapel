"use client";

import { useEffect, useRef } from "react";

import { HONEYPOT_FIELD } from "@/lib/customer-checks";

/**
 * Campo trampa, reloj del formulario y, si la tienda tiene clave, el desafío
 * invisible de Cloudflare Turnstile para los pedidos. El servidor rechaza la
 * trampa llena, un envío en menos de unos segundos o un desafío fallido.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TOKEN_TIMEOUT_MS = 15_000;

interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi | null> | null = null;

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.dataset.turnstile = "true";
    script.onload = () => resolve(window.turnstile ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function useBotTrap() {
  const trapRef = useRef<HTMLInputElement>(null);
  const challengeRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number | null>(null);
  const widgetRef = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const resolveRef = useRef<((token: string | undefined) => void) | null>(null);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  /** El script y el desafío se cargan al enviar: el token dura 300 s y sirve una sola vez. */
  const challengeToken = async (): Promise<string | undefined> => {
    const api = await loadTurnstile();
    const element = challengeRef.current;
    if (!api || !element) return undefined;
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (token: string | undefined) => {
        if (timer) clearTimeout(timer);
        resolveRef.current = null;
        resolve(token);
      };
      timer = setTimeout(() => finish(undefined), TOKEN_TIMEOUT_MS);
      resolveRef.current = finish;
      if (widgetRef.current) {
        widgetRef.current.api.reset(widgetRef.current.id);
        return;
      }
      const id = api.render(element, {
        sitekey: SITE_KEY,
        callback: (token: string) => resolveRef.current?.(token),
        "error-callback": () => resolveRef.current?.(undefined),
        "expired-callback": () => resolveRef.current?.(undefined),
      });
      widgetRef.current = { api, id };
    });
  };

  const fields = async () => {
    const base = { website: trapRef.current?.value ?? "", formStartedAt: startedAtRef.current ?? undefined };
    if (!SITE_KEY) return base;
    return { ...base, turnstileToken: await challengeToken() };
  };

  return { trapRef, challengeRef, fields };
}

export function BotTrapField({ trap }: { trap: ReturnType<typeof useBotTrap> }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0">
      <label>
        Sitio web
        <input ref={trap.trapRef} type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

/** Donde aparece el desafío al enviar: junto al botón, para que se vea si pide un clic. */
export function BotChallengeSlot({ trap }: { trap: ReturnType<typeof useBotTrap> }) {
  return SITE_KEY ? <div ref={trap.challengeRef} className="empty:hidden" /> : null;
}
