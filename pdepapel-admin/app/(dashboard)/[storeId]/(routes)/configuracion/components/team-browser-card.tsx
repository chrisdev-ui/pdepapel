"use client";

import { Loader2, MonitorSmartphone } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Marca el navegador de quien atiende la tienda: sus visitas dejan de contar
 * en GA4 (tráfico interno) y Clarity no las graba. Se hace en cada navegador
 * y teléfono del equipo; dura 400 días.
 */
export function TeamBrowserCard({ storeId }: { storeId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [unmarkUrl, setUnmarkUrl] = useState<string | null>(null);

  const markBrowser = async () => {
    setState("loading");
    // Se abre antes de la respuesta: los navegadores bloquean ventanas
    // que no salen directo de un toque.
    const opened = window.open("about:blank", "_blank");
    try {
      const response = await fetch(`/api/${storeId}/team-browser-link`, { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      const links = (await response.json()) as { markUrl: string; unmarkUrl: string };
      setUnmarkUrl(links.unmarkUrl);
      if (opened) {
        opened.opener = null;
        opened.location.href = links.markUrl;
      } else {
        window.location.href = links.markUrl;
      }
      setState("idle");
    } catch {
      opened?.close();
      setState("error");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
          Navegador del equipo
        </CardTitle>
        <CardDescription>
          Marca este navegador para que tus visitas a la tienda no cuenten en
          Google Analytics ni se graben en Clarity. Hazlo en cada computador y
          teléfono del equipo, desde el navegador con el que miras la tienda.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={markBrowser} disabled={state === "loading"}>
          {state === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Marcar este navegador
        </Button>
        {unmarkUrl ? (
          <a
            href={unmarkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-primary underline underline-offset-4"
          >
            Quitar la marca
          </a>
        ) : null}
        {state === "error" ? (
          <p role="alert" className="w-full text-sm text-destructive">
            No se pudo crear el enlace. Intenta de nuevo.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
