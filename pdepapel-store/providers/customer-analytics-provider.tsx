"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import {
  AnalyticsConsent,
  OPEN_PRIVACY_PREFERENCES_EVENT,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  syncAnalyticsConsentCookie,
} from "@/lib/analytics-consent";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const initialPreferences = {
  analytics: false,
};

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
  const pathname = usePathname();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [draftPreferences, setDraftPreferences] = useState(initialPreferences);
  const bannerRef = useRef<HTMLElement | null>(null);

  const hasClarity = Boolean(clarityEnabled && clarityProjectId);
  const hasOptionalAnalytics = Boolean(measurementId || hasClarity);
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
    const requiresReload = Boolean(
      consent?.analytics && !preferences.analytics,
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
          <h2 className="font-serif text-lg font-bold sm:text-xl">
            Tu privacidad, tus decisiones
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground sm:mt-2 sm:text-sm">
            Con tu permiso usamos métricas y reproducciones técnicas de la
            navegación para mejorar la tienda y entender qué dificulta una
            compra. Ocultamos los campos personales y nunca usamos estos datos
            para procesar tu pago.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="order-last col-span-2 h-9 sm:order-none sm:col-span-1 sm:h-10"
              onClick={() => setIsPreferencesOpen(true)}
            >
              Personalizar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => persistPreferences(initialPreferences)}
            >
              Rechazar opcionales
            </Button>
            <Button
              type="button"
              onClick={() => persistPreferences({ analytics: true })}
            >
              Aceptar y continuar
            </Button>
          </div>
        </section>
      )}

      <Dialog open={isPreferencesOpen} onOpenChange={setIsPreferencesOpen}>
        <DialogContent className="z-[10001]">
          <DialogHeader>
            <DialogTitle>Preferencias de privacidad</DialogTitle>
            <DialogDescription>
              Puedes cambiar esta decisión cuando quieras desde el pie de
              página. Las funciones esenciales para comprar siguen activas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
              <Checkbox checked disabled aria-label="Funciones esenciales" />
              <span>
                <span className="block font-medium">Funciones esenciales</span>
                <span className="block text-sm text-muted-foreground">
                  Necesarias para el carrito, el pedido, la seguridad y el pago.
                </span>
              </span>
            </label>
            {hasOptionalAnalytics && (
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <Checkbox
                  id="analytics-consent"
                  checked={draftPreferences.analytics}
                  onCheckedChange={(checked) =>
                    setDraftPreferences((preferences) => ({
                      ...preferences,
                      analytics: checked === true,
                    }))
                  }
                />
                <Label htmlFor="analytics-consent" className="cursor-pointer">
                  <span className="block font-medium">
                    Analítica y mejora de experiencia
                  </span>
                  <span className="mt-1 block text-sm font-normal text-muted-foreground">
                    Nos ayuda a entender páginas vistas, productos, carrito y
                    pasos del proceso de compra mediante métricas y sesiones
                    técnicas con los datos personales ocultos.
                  </span>
                </Label>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => persistPreferences(initialPreferences)}
            >
              Rechazar opcionales
            </Button>
            <Button
              type="button"
              onClick={() => persistPreferences(draftPreferences)}
            >
              Guardar preferencias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
