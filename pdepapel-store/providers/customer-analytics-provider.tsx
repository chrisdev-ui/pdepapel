"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  AnalyticsConsent,
  OPEN_PRIVACY_PREFERENCES_EVENT,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  syncAnalyticsConsentCookie,
} from "@/lib/analytics-consent";
import {
  isTikTokPixelLoaded,
  loadTikTokPixel,
  revokeTikTokConsent,
  tiktokPixelId,
  trackTikTokPage,
} from "@/lib/analytics/tiktok";
import {
  disableGoogleAnalytics,
  enableGoogleAnalytics,
  trackGooglePageView,
} from "@/lib/customer-analytics";
import {
  configureMicrosoftClarity,
  initializeMicrosoftClarity,
  isClarityEligiblePath,
  updateMicrosoftClarityContext,
} from "@/lib/microsoft-clarity";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useStorefrontPathname } from "@/hooks/use-storefront-pathname";
import { STOREFRONT_ROUTES } from "@/lib/routes";

const initialPreferences = {
  analytics: false,
  marketing: false,
};
const acceptAll = { analytics: true, marketing: true };

interface CustomerAnalyticsProviderProps {
  measurementId?: string;
  clarityProjectId?: string;
  clarityEnabled?: boolean;
}

function scheduleWhenIdle(callback: () => void): () => void {
  const idleWindow = window as unknown as {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 2000 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 1200);
  return () => window.clearTimeout(handle);
}

export function CustomerAnalyticsProvider({
  measurementId,
  clarityProjectId,
  clarityEnabled = false,
}: CustomerAnalyticsProviderProps) {
  const pathname = useStorefrontPathname();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [draftPreferences, setDraftPreferences] = useState(initialPreferences);
  const bannerRef = useRef<HTMLElement | null>(null);

  const hasClarity = Boolean(clarityEnabled && clarityProjectId);
  const hasOptionalAnalytics = Boolean(measurementId || hasClarity || tiktokPixelId());
  const showBanner =
    hasOptionalAnalytics && isReady && !consent && !isPreferencesOpen;

  useEffect(() => {
    const persistedConsent = readAnalyticsConsent();
    syncAnalyticsConsentCookie(persistedConsent);
    setConsent(persistedConsent);
    setDraftPreferences(
      persistedConsent
        ? {
            analytics: persistedConsent.analytics,
            marketing: persistedConsent.marketing,
          }
        : initialPreferences,
    );
    setIsReady(true);
  }, []);

  useEffect(() => {
    const openPreferences = () => setIsPreferencesOpen(true);
    window.addEventListener(OPEN_PRIVACY_PREFERENCES_EVENT, openPreferences);

    return () =>
      window.removeEventListener(
        OPEN_PRIVACY_PREFERENCES_EVENT,
        openPreferences,
      );
  }, []);

  useEffect(() => {
    if (!isReady) return;

    if (consent?.analytics && measurementId) {
      enableGoogleAnalytics(measurementId);
    } else {
      disableGoogleAnalytics();
    }
  }, [consent?.analytics, isReady, measurementId]);

  useEffect(() => {
    if (!isReady) return;

    configureMicrosoftClarity({
      enabled: hasClarity,
      projectId: clarityProjectId,
    });
    updateMicrosoftClarityContext({
      analyticsConsent: consent?.analytics === true,
      pathname,
    });

    if (
      !hasClarity ||
      !consent?.analytics ||
      !isClarityEligiblePath(pathname)
    ) {
      return;
    }

    return scheduleWhenIdle(() => {
      void initializeMicrosoftClarity();
    });
  }, [clarityProjectId, consent?.analytics, hasClarity, isReady, pathname]);

  useEffect(() => {
    if (!consent?.analytics || !measurementId || !isReady) return;

    trackGooglePageView(pathname, document.title);
  }, [consent?.analytics, isReady, measurementId, pathname]);

  // Píxel de TikTok solo con «Publicidad», cargado cuando el navegador está
  // libre (como Clarity) para no competir con el LCP. La carga manda la
  // primera vista; aquí solo las navegaciones siguientes, sin repetirla.
  const tiktokPathRef = useRef<string | null>(null);
  const latestPathRef = useRef(pathname);
  latestPathRef.current = pathname;
  useEffect(() => {
    if (!isReady) return;
    if (!consent?.marketing) {
      revokeTikTokConsent();
      tiktokPathRef.current = null;
      return;
    }
    if (!isTikTokPixelLoaded()) {
      return scheduleWhenIdle(() => {
        if (loadTikTokPixel()) tiktokPathRef.current = latestPathRef.current;
      });
    }
    if (tiktokPathRef.current !== pathname) {
      tiktokPathRef.current = pathname;
      trackTikTokPage();
    }
  }, [consent?.marketing, isReady, pathname]);

  // The banner is fixed to the bottom of the viewport. Reserve the same
  // height below the page and in the scroll padding so controls near the
  // bottom (for example the mobile "Filtros" button) can still be reached
  // before the visitor decides.
  useEffect(() => {
    if (!showBanner) return;

    const root = document.documentElement;
    const body = document.body;
    const apply = () => {
      const height = bannerRef.current?.getBoundingClientRect().height ?? 0;
      const offset = `${Math.ceil(height) + 24}px`;
      body.style.paddingBottom = offset;
      root.style.scrollPaddingBottom = offset;
    };

    apply();
    const observer =
      typeof ResizeObserver !== "undefined" && bannerRef.current
        ? new ResizeObserver(apply)
        : null;
    if (bannerRef.current) observer?.observe(bannerRef.current);
    window.addEventListener("resize", apply);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", apply);
      body.style.paddingBottom = "";
      root.style.scrollPaddingBottom = "";
    };
  }, [showBanner]);

  const persistPreferences = (preferences: typeof initialPreferences) => {
    // Retirar un permiso recarga: lo que ya cargó (GA, Clarity, el píxel) no se descarga solo.
    const requiresReload = Boolean(
      (consent?.analytics && !preferences.analytics) ||
        (consent?.marketing && !preferences.marketing),
    );
    const savedConsent = saveAnalyticsConsent(preferences);
    setConsent(savedConsent);
    setDraftPreferences(preferences);
    setIsPreferencesOpen(false);

    if (requiresReload) {
      window.location.reload();
    }
  };

  if (!hasOptionalAnalytics) return null;

  return (
    <>
      {showBanner && (
        <section
          ref={bannerRef}
          aria-label="Preferencias de privacidad"
          className="fixed inset-x-2 bottom-2 z-[10000] mx-auto max-w-2xl rounded-2xl border border-blue-baby bg-background p-4 shadow-xl sm:inset-x-4 sm:bottom-4 sm:p-6"
        >
          <p className="text-sm text-foreground sm:text-base">
            Usamos cookies para analizar la tienda y medir nuestros anuncios.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:items-center">
            <button
              type="button"
              className="order-last min-h-11 self-start text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80 sm:order-none sm:mr-auto"
              onClick={() => setIsPreferencesOpen(true)}
            >
              Configurar
            </button>
            <div className="grid grid-cols-2 gap-2 sm:w-[22rem]">
              <Button
                type="button"
                variant="outline"
                className="border-2 border-primary font-semibold text-primary"
                onClick={() => persistPreferences(initialPreferences)}
              >
                Solo necesarias
              </Button>
              <Button
                type="button"
                className="border-2 border-primary font-semibold"
                onClick={() => persistPreferences(acceptAll)}
              >
                Aceptar todo
              </Button>
            </div>
          </div>
        </section>
      )}

      <Dialog open={isPreferencesOpen} onOpenChange={setIsPreferencesOpen}>
        <DialogContent className="z-[10001]">
          <DialogHeader>
            <DialogTitle>Preferencias de privacidad</DialogTitle>
            <DialogDescription>
              Elige qué permites. Puedes cambiarlo cuando quieras desde
              «Preferencias de privacidad», en el pie de página. Comprar
              funciona igual con todo apagado. Más detalles en la{" "}
              <Link
                href={STOREFRONT_ROUTES.dataPolicy}
                className="font-medium text-primary underline underline-offset-4"
                onClick={() => setIsPreferencesOpen(false)}
              >
                política de privacidad
              </Link>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Checkbox checked disabled aria-label="Funciones esenciales" />
              <span>
                <span className="block font-medium">Funciones esenciales</span>
                <span className="block text-sm text-muted-foreground">
                  Necesarias para el carrito, el pedido, la seguridad y el pago.
                  Siempre activas.
                </span>
              </span>
            </div>
            {[
              {
                key: "analytics" as const,
                id: "consent-analytics",
                title: "Analítica",
                description:
                  "Métricas de visitas y de cómo se usa la tienda (Google Analytics y Microsoft Clarity), con tus datos personales ocultos. Nos ayuda a mejorarla.",
              },
              {
                key: "marketing" as const,
                id: "consent-marketing",
                title: "Publicidad",
                description:
                  "Compartimos con TikTok qué productos ves, agregas al carrito o compras, para medir nuestros anuncios. Sin tu nombre, correo, teléfono ni dirección.",
              },
            ].map((category) => (
              <div key={category.key} className="flex items-start justify-between gap-3 rounded-lg border p-4">
                <Label htmlFor={category.id} className="cursor-pointer">
                  <span className="block text-base font-medium">{category.title}</span>
                  <span className="mt-1 block text-sm font-normal text-muted-foreground">
                    {category.description}
                  </span>
                </Label>
                <Switch
                  id={category.id}
                  checked={draftPreferences[category.key]}
                  onCheckedChange={(checked) =>
                    setDraftPreferences((preferences) => ({
                      ...preferences,
                      [category.key]: checked,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="w-full sm:w-auto sm:min-w-40"
              onClick={() => persistPreferences(draftPreferences)}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
