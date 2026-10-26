// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vercel = vi.hoisted(() => ({ track: vi.fn(), Analytics: vi.fn(() => null) }));
const nav = vi.hoisted(() => ({ pathname: "/tienda" }));
vi.mock("@vercel/analytics/react", () => vercel);
vi.mock("@/lib/microsoft-clarity", () => ({ trackMicrosoftClarityEvent: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import { VercelAnalytics, vercelAnalyticsBeforeSend } from "@/components/vercel-analytics";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "@/lib/analytics-consent";
import { enableGoogleAnalytics, trackCustomerEvent, trackGooglePageView } from "@/lib/customer-analytics";

/**
 * Ninguna llamada de analítica desde el recibo (ni desde la página siguiente)
 * lleva el id del pedido, la transacción de la pasarela ni el número de pedido.
 */
const ORDER_ID = "3f2c1a9e-1111-4222-8333-444455556666";
const PREVIOUS_ORDER_ID = "9a8b7c6d-1111-4222-8333-777788889999";
const TRANSACTION = "11111-1777777777-22222";
const ORDER_NUMBER = "ORD-1792000000000-123";
const SECRETS = [ORDER_ID, PREVIOUS_ORDER_ID, TRANSACTION, ORDER_NUMBER, "bold-order-id", "bold-tx-status"];

const grantConsent = () =>
  window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify({ analytics: true, marketing: false, updatedAt: "2026-10-20T00:00:00.000Z" }));
const setReferrer = (value: string) => Object.defineProperty(document, "referrer", { configurable: true, value });
const sentToGoogle = () => JSON.stringify((window.dataLayer ?? []).map((entry) => Array.from(entry as IArguments)));

class FakeObserver {
  static supportedEntryTypes = ["layout-shift"];
  static callback: ((list: { getEntries: () => unknown[] }) => void) | null = null;
  constructor(callback: (list: { getEntries: () => unknown[] }) => void) {
    FakeObserver.callback = callback;
  }
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  window.localStorage.clear();
  delete window.dataLayer;
  delete window.gtag;
  document.head.innerHTML = "";
  vercel.track.mockReset();
  nav.pathname = "/tienda";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  setReferrer("");
});

describe("analítica en el recibo", () => {
  it("GA4: page_view, eventos y contexto de página sin id, transacción ni número de pedido; los utm_* se quedan", () => {
    grantConsent();
    window.history.replaceState({}, "", `/pedido/${ORDER_ID}?id=${TRANSACTION}&bold-order-id=${ORDER_NUMBER}&bold-tx-status=approved&utm_source=whatsapp`);
    setReferrer(`https://papeleriapdepapel.com/pedido/${PREVIOUS_ORDER_ID}?id=${TRANSACTION}`);
    document.title = `Pedido #${ORDER_NUMBER} | Papelería P de Papel`;

    trackGooglePageView(window.location.pathname, document.title);
    enableGoogleAnalytics("G-TEST123");
    trackCustomerEvent("order_account_prompt_viewed", { source: "order_detail" });

    const google = sentToGoogle();
    for (const secret of SECRETS) expect(google, secret).not.toContain(secret);
    expect(google).toContain("/pedido/[id]?utm_source=whatsapp");
    expect(google).toContain("Tu pedido | Papelería P de Papel");
    const vercelCalls = JSON.stringify(vercel.track.mock.calls);
    for (const secret of SECRETS) expect(vercelCalls, secret).not.toContain(secret);
  });

  it("la página siguiente: el referrer del recibo llega a GA4 como /pedido/[id]", () => {
    grantConsent();
    window.history.replaceState({}, "", "/tienda");
    setReferrer(`https://papeleriapdepapel.com/pedido/${ORDER_ID}?bold-order-id=${ORDER_NUMBER}`);
    document.title = "Tienda | Papelería P de Papel";

    enableGoogleAnalytics("G-TEST123");
    trackGooglePageView("/tienda", document.title);

    const google = sentToGoogle();
    for (const secret of SECRETS) expect(google, secret).not.toContain(secret);
    expect(google).toContain('"page_referrer":"https://papeleriapdepapel.com/pedido/[id]"');
  });

  it("Vercel: sin permiso no sale nada; con permiso, la URL del recibo sale limpia", () => {
    const pageview = { type: "pageview" as const, url: `https://papeleriapdepapel.com/pedido/${ORDER_ID}?id=${TRANSACTION}&utm_medium=chat` };
    expect(vercelAnalyticsBeforeSend(pageview)).toBeNull();

    grantConsent();
    const sent = vercelAnalyticsBeforeSend(pageview);
    expect(sent).toEqual({ type: "pageview", url: "https://papeleriapdepapel.com/pedido/[id]?utm_medium=chat" });
    expect(vercelAnalyticsBeforeSend({ type: "event" as const, url: "https://papeleriapdepapel.com/tienda?q=agenda" })).toEqual({ type: "event", url: "https://papeleriapdepapel.com/tienda?q=agenda" });

    render(<VercelAnalytics />);
    expect((vercel.Analytics.mock.calls[0] as unknown[])[0]).toMatchObject({ beforeSend: vercelAnalyticsBeforeSend });
  });

  it("web vitals desde el recibo: la ruta va como /pedido/[id]", () => {
    grantConsent();
    window.gtag = vi.fn();
    vi.stubGlobal("PerformanceObserver", FakeObserver);
    nav.pathname = `/pedido/${ORDER_ID}`;
    render(<WebVitalsReporter sampleRate={1} />);
    act(() => {
      FakeObserver.callback?.({ getEntries: () => [{ startTime: 10, value: 0.2, hadRecentInput: false, sources: [] }] });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const calls = JSON.stringify((window.gtag as ReturnType<typeof vi.fn>).mock.calls);
    expect(calls).toContain('"cls_page":"/pedido/[id]"');
    expect(calls).not.toContain(ORDER_ID);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
});
