// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANALYTICS_CONSENT_COOKIE_NAME,
  ANALYTICS_CONSENT_ENDPOINT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  OPEN_PRIVACY_PREFERENCES_EVENT,
  serializeAnalyticsConsentCookie,
} from "@/lib/analytics-consent";
import { CustomerAnalyticsProvider } from "@/providers/customer-analytics-provider";

const analyticsMocks = vi.hoisted(() => ({
  disableGoogleAnalytics: vi.fn(),
  enableGoogleAnalytics: vi.fn(),
  trackGooglePageView: vi.fn(),
}));
const clarityMocks = vi.hoisted(() => ({
  configureMicrosoftClarity: vi.fn(),
  initializeMicrosoftClarity: vi.fn().mockResolvedValue(true),
  isClarityEligiblePath: vi.fn().mockReturnValue(true),
  updateMicrosoftClarityContext: vi.fn(),
}));

const navigation = vi.hoisted(() => ({ pathname: "/tienda" }));
const tiktokMocks = vi.hoisted(() => {
  let loaded = false;
  return {
    tiktokPixelId: vi.fn(() => "TESTPIXEL123"),
    isTikTokPixelLoaded: vi.fn(() => loaded),
    loadTikTokPixel: vi.fn(() => {
      loaded = true;
      return true;
    }),
    revokeTikTokConsent: vi.fn(),
    trackTikTokPage: vi.fn(),
    reset: () => {
      loaded = false;
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));
vi.mock("@/lib/customer-analytics", () => analyticsMocks);
vi.mock("@/lib/microsoft-clarity", () => clarityMocks);
vi.mock("@/lib/analytics/tiktok", () => tiktokMocks);

const banner = () => screen.queryByRole("region", { name: "Preferencias de privacidad" });
const findBanner = () => screen.findByRole("region", { name: "Preferencias de privacidad" });

function renderProvider() {
  return render(
    <CustomerAnalyticsProvider
      measurementId="G-8X3M77ZB3Z"
      clarityProjectId="sc857ich8n"
      clarityEnabled
    />,
  );
}

describe("CustomerAnalyticsProvider", () => {
  let idleCallback: IdleRequestCallback | null;
  let idleCallbacks: IdleRequestCallback[];
  const runIdle = () =>
    act(() => {
      for (const callback of idleCallbacks.splice(0)) callback({ didTimeout: false, timeRemaining: () => 50 });
    });
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));

  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    document.cookie = `${ANALYTICS_CONSENT_COOKIE_NAME}=; Max-Age=0; path=/`;
    idleCallback = null;
    idleCallbacks = [];
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback;
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }),
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      value: vi.fn(),
    });
    fetchMock.mockClear();
    navigation.pathname = "/tienda";
    tiktokMocks.reset();
    vi.stubGlobal("fetch", fetchMock);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps analytics disabled until the customer accepts", async () => {
    renderProvider();

    expect(
      await findBanner(),
    ).toBeInTheDocument();
    expect(clarityMocks.initializeMicrosoftClarity).not.toHaveBeenCalled();
    expect(analyticsMocks.enableGoogleAnalytics).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Aceptar todo" }),
    );

    await waitFor(() => {
      expect(analyticsMocks.enableGoogleAnalytics).toHaveBeenCalledWith(
        "G-8X3M77ZB3Z",
      );
    });
    expect(
      JSON.parse(
        window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) ?? "{}",
      ),
    ).toMatchObject({ analytics: true, marketing: true });
    // El píxel espera a que el navegador esté libre: nada compite con el LCP.
    expect(tiktokMocks.loadTikTokPixel).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      ANALYTICS_CONSENT_ENDPOINT,
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      banner(),
    ).not.toBeInTheDocument();

    runIdle();
    expect(clarityMocks.initializeMicrosoftClarity).toHaveBeenCalledTimes(1);
    expect(tiktokMocks.loadTikTokPixel).toHaveBeenCalledTimes(1);
  });

  it("reserves space below the page while the banner is visible", async () => {
    renderProvider();

    expect(
      await findBanner(),
    ).toBeInTheDocument();
    expect(document.body.style.paddingBottom).toMatch(/^\d+px$/);
    expect(document.documentElement.style.scrollPaddingBottom).toBe(
      document.body.style.paddingBottom,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Solo necesarias" }),
    );

    await waitFor(() => {
      expect(
        banner(),
      ).not.toBeInTheDocument();
    });
    expect(document.body.style.paddingBottom).toBe("");
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
  });

  it("does not ask again a returning visitor who already accepted", async () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify({
        analytics: true, marketing: false,
        updatedAt: "2026-08-27T17:52:42.293Z",
      }),
    );

    renderProvider();

    await waitFor(() => {
      expect(analyticsMocks.enableGoogleAnalytics).toHaveBeenCalledWith(
        "G-8X3M77ZB3Z",
      );
    });
    expect(
      banner(),
    ).not.toBeInTheDocument();
    expect(analyticsMocks.trackGooglePageView).toHaveBeenCalled();
    // The cookie mirror was missing, so the provider re-issues it silently.
    expect(fetchMock).toHaveBeenCalledWith(
      ANALYTICS_CONSENT_ENDPOINT,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("remembers a rejection without re-asking or loading providers", async () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify({
        analytics: false, marketing: false,
        updatedAt: "2026-08-27T17:52:42.293Z",
      }),
    );

    renderProvider();

    await waitFor(() => {
      expect(analyticsMocks.disableGoogleAnalytics).toHaveBeenCalled();
    });
    expect(
      banner(),
    ).not.toBeInTheDocument();
    expect(analyticsMocks.enableGoogleAnalytics).not.toHaveBeenCalled();
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(clarityMocks.initializeMicrosoftClarity).not.toHaveBeenCalled();
  });

  it("restores the decision from the cookie when local storage was purged", async () => {
    const consent = {
      analytics: true, marketing: false,
      updatedAt: "2026-08-27T17:52:42.293Z",
    };
    document.cookie = `${ANALYTICS_CONSENT_COOKIE_NAME}=${serializeAnalyticsConsentCookie(consent)}; path=/`;

    renderProvider();

    await waitFor(() => {
      expect(analyticsMocks.enableGoogleAnalytics).toHaveBeenCalledWith(
        "G-8X3M77ZB3Z",
      );
    });
    expect(
      banner(),
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(
        window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) ?? "null",
      ),
    ).toEqual(consent);
    // The cookie is current, so no server round-trip is needed.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("«Solo necesarias» y «Aceptar todo» tienen el mismo peso, y la línea nombra los dos fines", async () => {
    renderProvider();
    const region = await findBanner();
    expect(region).toHaveTextContent("Usamos cookies para analizar la tienda y medir nuestros anuncios.");
    expect(screen.getByRole("button", { name: "Solo necesarias" }).className).toContain("border-2");
    expect(screen.getByRole("button", { name: "Aceptar todo" }).className).toContain("border-2");

    fireEvent.click(screen.getByRole("button", { name: "Solo necesarias" }));
    await waitFor(() => expect(banner()).not.toBeInTheDocument());
    expect(JSON.parse(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) ?? "{}")).toMatchObject({ analytics: false, marketing: false });
    expect(analyticsMocks.enableGoogleAnalytics).not.toHaveBeenCalled();
    expect(tiktokMocks.loadTikTokPixel).not.toHaveBeenCalled();
  });

  it("«Configurar» abre Analítica y Publicidad apagadas; solo Publicidad carga TikTok y no GA", async () => {
    renderProvider();
    await findBanner();
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));

    const dialog = await screen.findByRole("dialog", { name: "Preferencias de privacidad" });
    const analytics = within(dialog).getByRole("switch", { name: /Analítica/ });
    const marketing = within(dialog).getByRole("switch", { name: /Publicidad/ });
    expect(analytics).toHaveAttribute("aria-checked", "false");
    expect(marketing).toHaveAttribute("aria-checked", "false");
    expect(within(dialog).getByRole("link", { name: "política de privacidad" })).toHaveAttribute("href", "/politicas/privacidad");

    fireEvent.click(marketing);
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(idleCallbacks.length).toBeGreaterThan(0));
    runIdle();
    expect(tiktokMocks.loadTikTokPixel).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) ?? "{}")).toMatchObject({ analytics: false, marketing: true });
    expect(analyticsMocks.enableGoogleAnalytics).not.toHaveBeenCalled();
  });

  it("sin «Publicidad» no carga TikTok; con ella manda la vista de cada navegación sin repetir la primera", async () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify({ analytics: false, marketing: true, updatedAt: "2026-10-26T00:00:00.000Z" }),
    );
    const view = renderProvider();
    await waitFor(() => expect(idleCallbacks.length).toBeGreaterThan(0));
    expect(tiktokMocks.loadTikTokPixel).not.toHaveBeenCalled();
    runIdle();
    expect(tiktokMocks.loadTikTokPixel).toHaveBeenCalledTimes(1);
    expect(tiktokMocks.trackTikTokPage).not.toHaveBeenCalled();

    navigation.pathname = "/producto/libreta";
    view.rerender(<CustomerAnalyticsProvider measurementId="G-8X3M77ZB3Z" clarityProjectId="sc857ich8n" clarityEnabled />);
    await waitFor(() => expect(tiktokMocks.trackTikTokPage).toHaveBeenCalledTimes(1));
    expect(tiktokMocks.loadTikTokPixel).toHaveBeenCalledTimes(1);
  });

  it("retirar «Publicidad» revoca el permiso y recarga la página", async () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify({ analytics: true, marketing: true, updatedAt: "2026-10-26T00:00:00.000Z" }),
    );
    const reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
    renderProvider();
    await waitFor(() => expect(idleCallbacks.length).toBeGreaterThan(0));
    runIdle();
    expect(tiktokMocks.loadTikTokPixel).toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event(OPEN_PRIVACY_PREFERENCES_EVENT));
    });
    const marketing = await screen.findByRole("switch", { name: /Publicidad/ });
    expect(marketing).toHaveAttribute("aria-checked", "true");
    fireEvent.click(marketing);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(tiktokMocks.revokeTikTokConsent).toHaveBeenCalled());
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
