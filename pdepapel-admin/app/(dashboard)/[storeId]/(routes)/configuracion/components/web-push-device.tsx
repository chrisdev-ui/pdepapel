"use client";

import axios from "axios";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type PushState = "loading" | "unsupported" | "not_configured" | "blocked" | "off" | "on";

const STATE_TEXT: Record<Exclude<PushState, "loading">, string> = {
  on: "Activado en este aparato.",
  off: "Desactivado en este aparato.",
  blocked: "Bloqueado por el navegador: permite las notificaciones de este sitio en los ajustes del navegador y vuelve a intentar.",
  not_configured: "No configurado: al panel le faltan las llaves de los avisos.",
  unsupported: "Este navegador no admite avisos.",
};

const supportsPush = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

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

  const refresh = useCallback(async () => {
    if (!supportsPush()) return setState("unsupported");
    try {
      const { data } = await axios.get<{ configured: boolean; publicKey: string | null }>(`/api/${storeId}/web-push`);
      if (!data.configured || !data.publicKey) return setState("not_configured");
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
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const key = urlBase64ToBuffer(publicKey);
      let subscription = await registration.pushManager.getSubscription();
      // Hecha con una llave anterior (se rotaron las llaves): ya no recibe nada, se rehace.
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await axios.post(`/api/${storeId}/web-push`, subscription.toJSON());
      setState("on");
      toast({ description: "Avisos activados en este aparato", variant: "success" });
    } catch (error) {
      const message = axios.isAxiosError(error) ? (error.response?.data?.error ?? "No se pudieron activar los avisos") : "No se pudieron activar los avisos";
      toast({ description: message, variant: "warning" });
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
          {STATE_TEXT[state]}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {state === "on" ? (
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={deactivate} disabled={busy}>
            Desactivar
          </Button>
        ) : (
          <Button type="button" className="min-h-[44px]" onClick={activate} disabled={busy || state !== "off"}>
            Activar avisos en este aparato
          </Button>
        )}
      </div>
    </div>
  );
}
