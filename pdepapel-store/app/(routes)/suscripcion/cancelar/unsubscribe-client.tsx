"use client";

import { CheckCircle2, Loader2, MailX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export function UnsubscribeClient({ token }: { token: string }) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const unsubscribe = async () => {
    try {
      setStatus("loading");
      const response = await fetch("/api/newsletter/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error("invalid");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <>
        <CheckCircle2
          className="mx-auto h-12 w-12 text-emerald-600"
          aria-hidden="true"
        />
        <h1 className="mt-5 font-serif text-3xl font-semibold text-blue-yankees">
          Suscripción cancelada
        </h1>
        <p className="mt-3 text-muted-foreground">
          No recibirás más novedades de marketing. Los correos necesarios sobre
          tus pedidos seguirán funcionando.
        </p>
        <Link
          href={STOREFRONT_ROUTES.home}
          className="min-h-11 mt-7 inline-flex items-center justify-center rounded-lg bg-blue-yankees px-6 font-medium text-white"
        >
          Volver al inicio
        </Link>
      </>
    );
  }

  return (
    <>
      <MailX
        className="mx-auto h-12 w-12 text-blue-yankees"
        aria-hidden="true"
      />
      <h1 className="mt-5 font-serif text-3xl font-semibold text-blue-yankees">
        Cancelar novedades
      </h1>
      <p className="mt-3 text-muted-foreground">
        Dejarás de recibir lanzamientos y ofertas. Esta acción no afecta tus
        pedidos ni tu cuenta.
      </p>
      {status === "error" ? (
        <p role="alert" className="mt-4 text-sm font-medium text-destructive">
          El enlace no es válido o ya no está disponible.
        </p>
      ) : null}
      <Button
        className="min-h-11 mt-7"
        onClick={unsubscribe}
        disabled={!token || status === "loading"}
      >
        {status === "loading" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Confirmar cancelación
      </Button>
    </>
  );
}
