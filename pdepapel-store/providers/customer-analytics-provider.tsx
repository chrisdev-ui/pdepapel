"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import {
  AnalyticsConsent,
  OPEN_PRIVACY_PREFERENCES_EVENT,
  readAnalyticsConsent,
  saveAnalyticsConsent,
} from "@/lib/analytics-consent";
import {
  disableGoogleAnalytics,
  enableGoogleAnalytics,
  trackGooglePageView,
} from "@/lib/customer-analytics";
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
}

export function CustomerAnalyticsProvider({
  measurementId,
}: CustomerAnalyticsProviderProps) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [draftPreferences, setDraftPreferences] = useState(initialPreferences);

  const hasOptionalAnalytics = Boolean(measurementId);

  useEffect(() => {
    const persistedConsent = readAnalyticsConsent();
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
    if (!consent?.analytics || !measurementId || !isReady) return;

    trackGooglePageView(pathname, document.title);
  }, [consent?.analytics, isReady, measurementId, pathname]);

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
      {isReady && !consent && (
        <section
          aria-label="Preferencias de privacidad"
          className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-2xl rounded-2xl border border-blue-baby bg-background p-5 shadow-xl sm:p-6"
        >
          <h2 className="font-serif text-xl font-bold">
            Tu privacidad, tus decisiones
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Con tu permiso usamos analítica de compras para mejorar la tienda y
            entender qué dificulta finalizar una compra. Nunca usamos estos
            datos para procesar tu pago.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => persistPreferences(initialPreferences)}
            >
              Rechazar opcionales
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPreferencesOpen(true)}
            >
              Personalizar
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
        <DialogContent>
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
            {measurementId && (
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
                    Analítica de compras
                  </span>
                  <span className="mt-1 block text-sm font-normal text-muted-foreground">
                    Nos ayuda a entender páginas vistas, productos, carrito y
                    pasos del proceso de compra de forma agregada.
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
