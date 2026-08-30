// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const clarityMocks = vi.hoisted(() => ({
  consentV2: vi.fn(),
  event: vi.fn(),
  init: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock("@microsoft/clarity", () => ({
  default: clarityMocks,
}));

async function loadClarityModule() {
  return import("@/lib/microsoft-clarity");
}

describe("Microsoft Clarity integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("limits collection to the public commerce funnel", async () => {
    const {
      getClarityRouteGroup,
      isClarityEligiblePath,
      shouldMaskClarityPage,
    } = await loadClarityModule();

    expect(getClarityRouteGroup("/")).toBe("inicio");
    expect(getClarityRouteGroup("/producto/cuaderno-kawaii")).toBe("producto");
    expect(isClarityEligiblePath("/finalizar-compra")).toBe(true);
    expect(isClarityEligiblePath("/pedido/order-id")).toBe(false);
    expect(isClarityEligiblePath("/cotizacion/token")).toBe(false);
    expect(shouldMaskClarityPage("/pedido/order-id")).toBe(true);
    expect(shouldMaskClarityPage("/mis-pedidos")).toBe(true);
    expect(shouldMaskClarityPage("/tienda")).toBe(false);
  });

  it("does not initialize before analytics consent", async () => {
    const {
      configureMicrosoftClarity,
      initializeMicrosoftClarity,
      updateMicrosoftClarityContext,
    } = await loadClarityModule();

    configureMicrosoftClarity({ enabled: true, projectId: "sc857ich8n" });
    updateMicrosoftClarityContext({
      analyticsConsent: false,
      pathname: "/tienda",
    });

    await expect(initializeMicrosoftClarity()).resolves.toBe(false);
    expect(clarityMocks.init).not.toHaveBeenCalled();
  });

  it("loads after consent and flushes only approved event names", async () => {
    const {
      configureMicrosoftClarity,
      initializeMicrosoftClarity,
      trackMicrosoftClarityEvent,
      updateMicrosoftClarityContext,
    } = await loadClarityModule();

    configureMicrosoftClarity({ enabled: true, projectId: "sc857ich8n" });
    updateMicrosoftClarityContext({
      analyticsConsent: true,
      pathname: "/finalizar-compra",
    });
    trackMicrosoftClarityEvent("begin_checkout");
    trackMicrosoftClarityEvent("unknown_event");

    await expect(initializeMicrosoftClarity()).resolves.toBe(true);

    expect(clarityMocks.init).toHaveBeenCalledWith("sc857ich8n");
    expect(clarityMocks.consentV2).toHaveBeenCalledWith({
      ad_Storage: "denied",
      analytics_Storage: "granted",
    });
    expect(clarityMocks.setTag).toHaveBeenCalledWith(
      "route_group",
      "finalizar_compra",
    );
    expect(clarityMocks.setTag).toHaveBeenCalledWith("checkout_step", "inicio");
    expect(clarityMocks.event).toHaveBeenCalledTimes(1);
    expect(clarityMocks.event).toHaveBeenCalledWith("begin_checkout");
  });

  it("uses only allowlisted checkout step tags from event parameters", async () => {
    const {
      configureMicrosoftClarity,
      initializeMicrosoftClarity,
      trackMicrosoftClarityEvent,
      updateMicrosoftClarityContext,
    } = await loadClarityModule();

    configureMicrosoftClarity({ enabled: true, projectId: "sc857ich8n" });
    updateMicrosoftClarityContext({
      analyticsConsent: true,
      pathname: "/finalizar-compra",
    });
    await initializeMicrosoftClarity();
    vi.clearAllMocks();

    trackMicrosoftClarityEvent("checkout_step_view", {
      checkout_step_name: "envio",
      email: "never-forward-this@example.com",
    });

    expect(clarityMocks.setTag).toHaveBeenCalledWith("checkout_step", "envio");
    expect(clarityMocks.event).toHaveBeenCalledWith("checkout_step_view");
    expect(clarityMocks.event).toHaveBeenCalledTimes(1);
  });

  it("distinguishes manual and automatic cart preview dismissals", async () => {
    const {
      configureMicrosoftClarity,
      initializeMicrosoftClarity,
      trackMicrosoftClarityEvent,
      updateMicrosoftClarityContext,
    } = await loadClarityModule();

    configureMicrosoftClarity({ enabled: true, projectId: "sc857ich8n" });
    updateMicrosoftClarityContext({
      analyticsConsent: true,
      pathname: "/producto/cuaderno-kawaii",
    });
    await initializeMicrosoftClarity();
    vi.clearAllMocks();

    trackMicrosoftClarityEvent("cart_preview_dismiss", { reason: "manual" });
    trackMicrosoftClarityEvent("cart_preview_dismiss", { reason: "auto" });

    expect(clarityMocks.event).toHaveBeenNthCalledWith(
      1,
      "cart_preview_dismiss_manual",
    );
    expect(clarityMocks.event).toHaveBeenNthCalledWith(
      2,
      "cart_preview_dismiss_auto",
    );
  });

  it("denies Clarity storage when navigation becomes sensitive", async () => {
    const {
      configureMicrosoftClarity,
      initializeMicrosoftClarity,
      trackMicrosoftClarityEvent,
      updateMicrosoftClarityContext,
    } = await loadClarityModule();

    configureMicrosoftClarity({ enabled: true, projectId: "sc857ich8n" });
    updateMicrosoftClarityContext({
      analyticsConsent: true,
      pathname: "/producto/cuaderno-kawaii",
    });
    await initializeMicrosoftClarity();
    vi.clearAllMocks();

    updateMicrosoftClarityContext({
      analyticsConsent: true,
      pathname: "/pedido/order-id",
    });
    trackMicrosoftClarityEvent("add_to_cart");

    expect(clarityMocks.consentV2).toHaveBeenCalledWith({
      ad_Storage: "denied",
      analytics_Storage: "denied",
    });
    expect(clarityMocks.event).not.toHaveBeenCalled();
  });
});
