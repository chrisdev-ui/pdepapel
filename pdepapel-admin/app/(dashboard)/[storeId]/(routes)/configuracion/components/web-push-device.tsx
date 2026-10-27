"use client";

import axios from "axios";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { describePushFailure, notConfiguredText, unsupportedReason, type PushStep } from "@/lib/web-push-client";

type PushState = "loading" | "unsupported" | "not_configured" | "blocked" | "off" | "on" | "status_error";

const STATE_TEXT: Record<Exclude<PushState, "loading" | "unsupported">, string> = {
  on: "Activado en este aparato.",
  off: "Desactivado en este aparato.",
  blocked: "Bloqueado: permite las notificaciones del panel (en iPhone: Ajustes › Notificaciones › P de Papel) y vuelve a intentar.",
  not_configured: "No configurado: al panel le faltan las llaves de los avisos.",
  status_error: "No se pudo consultar el estado de los avisos. Recarga la página; si sigue, cierra sesión y vuelve a entrar.",
};

const pushEnvironment = () => ({
  userAgent: navigator.userAgent,
  standalone:
    window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  hasPushManager: "PushManager" in window,
  hasServiceWorker: "serviceWorker" in navigator,
  hasNotification: "Notification" in window,
});

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function sameKey(current: ArrayBuffer | null, expected: ArrayBuffer): boolean {
  if (!current || current.byteLength !== expected.byteLength) return false;
  const a = new Uint8Array(current);
  const b = new Uint8Array(expected);
  return a.every((byte, index) => byte === b[index]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * «Activar avisos en este aparato»: el service worker se registra solo al
 * pulsar el botón, nunca al cargar el panel.
 */
export function WebPushDevice({ storeId, minutes }: { storeId: string; minutes: number }) {
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unsupportedText, setUnsupportedText] = useState<string | null>(null);
  const [configReason, setConfigReason] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const reason = unsupportedReason(pushEnvironment());
    if (reason) {
      setUnsupportedText(reason);
      return setState("unsupported");
    }
    let data: { configured: boolean; reason?: string | null; publicKey: string | null };
    try {
      ({ data } = await axios.get<{ configured: boolean; reason?: string | null; publicKey: string | null }>(`/api/${storeId}/web-push`));
    } catch {
      // Antes quedaba «Desactivado» con el botón sin hacer nada (sin llave pública).
      return setState("status_error");
    }
    try {
      if (!data.configured || !data.publicKey) {
        setConfigReason(data.reason ?? null);
        return setState("not_configured");
      }
      setPublicKey(data.publicKey);
      if (Notification.permission === "denied") return setState("blocked");
      const subscription = await currentSubscription();
      if (subscription && Notification.permission === "granted") {
        // Por si el panel la borró (aparato vencido o tope): se vuelve a guardar sin preguntar.
        await axios.post(`/api/${storeId}/web-push`, subscription.toJSON()).catch(() => undefined);
        return setState("on");
      }
      setState("off");
    } catch {
      setState("off");
    }
  }, [storeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activate = async () => {
    if (!publicKey) return;
    setBusy(true);
    let step: PushStep = "permission";
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      step = "register";
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      step = "subscribe";
      const key = urlBase64ToBuffer(publicKey);
      let subscription = await registration.pushManager.getSubscription();
      // Hecha con una llave anterior (se rotaron las llaves): ya no recibe nada, se rehace.
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      step = "save";
      await axios.post(`/api/${storeId}/web-push`, subscription.toJSON());
      setState("on");
      toast({ description: "Avisos activados en este aparato", variant: "success" });
    } catch (error) {
      const apiMessage = axios.isAxiosError(error) ? (error.response?.data?.error ?? null) : null;
      console.warn("[WEB_PUSH] No se activaron los avisos", { step, error: error instanceof Error ? error.name : "unknown" });
      toast({ description: describePushFailure(step, error, apiMessage), variant: "warning" });
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await axios.delete(`/api/${storeId}/web-push`, { data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setState("off");
      toast({ description: "Avisos desactivados en este aparato", variant: "success" });
    } catch {
      toast({ description: "No se pudieron desactivar los avisos", variant: "warning" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Avisos en este aparato</p>
      <p className="text-sm text-muted-foreground">
        Te llega un aviso cuando una clienta lleva {minutes} min sin respuesta, de 7 a. m. a 9:59 p. m. Uno por espera; no dice
        quién es ni qué escribió.
      </p>
      <p className="text-sm text-muted-foreground">
        En iPhone o iPad: primero «Compartir» › «Agregar a pantalla de inicio», abre el panel desde ese ícono y actívalos ahí.
      </p>
      {state !== "loading" && (
        <p role="status" className="text-sm">
          {state === "unsupported" ? unsupportedText : state === "not_configured" ? notConfiguredText(configReason) : STATE_TEXT[state]}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {state === "on" ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={deactivate} disabled={busy}>
            Desactivar
          </Button>
        ) : (
          <Button type="button" className="min-h-11" onClick={activate} disabled={busy || state !== "off"}>
            Activar avisos en este aparato
          </Button>
        )}
      </div>
    </div>
  );
}
