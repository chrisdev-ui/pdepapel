"use client";

import { CheckCircle2, CircleAlert, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { NEWSLETTER_CONFIRM_URL } from "@/lib/newsletter-signup";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export type ConfirmLinkStatus = "valid" | "already_confirmed" | "expired" | "invalid" | "error";
type Status = ConfirmLinkStatus | "confirming" | "confirmed";

const COPY: Record<Exclude<Status, "valid" | "confirming">, { title: string; body: string }> = {
  confirmed: {
    title: "¡Suscripción confirmada!",
    body: "Te enviamos un correo de bienvenida. Si no lo ves en unos minutos, revisa la carpeta de spam.",
  },
  already_confirmed: {
    title: "Tu suscripción ya estaba confirmada",
    body: "No tienes que hacer nada más. Seguirás recibiendo nuestras novedades.",
  },
  expired: {
    title: "El enlace ya venció",
    body: "Vuelve a escribir tu correo en el formulario del sitio y te enviamos uno nuevo.",
  },
  invalid: {
    title: "No pudimos confirmar el enlace",
    body: "El enlace puede estar incompleto. Puedes pedir una nueva confirmación desde el formulario del sitio.",
  },
  error: {
    title: "No pudimos confirmar ahora",
    body: "Tuvimos un problema temporal. Inténtalo de nuevo en unos minutos.",
  },
};

export function ConfirmClient({ token, initialStatus }: { token: string; initialStatus: ConfirmLinkStatus }) {
  const [status, setStatus] = useState<Status>(initialStatus);

  const confirm = async () => {
    setStatus("confirming");
    try {
      const response = await fetch(NEWSLETTER_CONFIRM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = (await response.json().catch(() => null)) as { status?: string } | null;
      const next = result?.status;
      setStatus(
        next === "confirmed" || next === "already_confirmed" || next === "expired" || next === "invalid"
          ? next
          : "error",
      );
    } catch {
      setStatus("error");
    }
  };

  if (status === "valid" || status === "confirming") {
    return (
      <>
        <MailCheck className="mx-auto h-12 w-12 text-blue-yankees" aria-hidden="true" />
        <h1 className="mt-5 font-serif text-3xl font-semibold text-blue-yankees">
          Confirma tu suscripción
        </h1>
        <p className="mt-3 text-muted-foreground">
          Un clic y listo: recibirás hasta dos correos al mes con novedades, lanzamientos y ofertas.
        </p>
        <Button className="min-h-11 mt-7" onClick={confirm} disabled={status === "confirming"}>
          {status === "confirming" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Confirmar mi suscripción
        </Button>
      </>
    );
  }

  const done = status === "confirmed" || status === "already_confirmed";
  const Icon = done ? CheckCircle2 : status === "expired" ? MailCheck : CircleAlert;
  const copy = COPY[status];

  return (
    <>
      <Icon className={`mx-auto h-12 w-12 ${done ? "text-emerald-600" : "text-amber-600"}`} aria-hidden="true" />
      <h1 className="mt-5 font-serif text-3xl font-semibold text-blue-yankees">{copy.title}</h1>
      <p className="mt-3 text-muted-foreground" role={done ? "status" : undefined}>
        {copy.body}
      </p>
      <Link
        href={done ? STOREFRONT_ROUTES.shop : STOREFRONT_ROUTES.home}
        className="min-h-11 mt-7 inline-flex items-center justify-center rounded-lg bg-blue-yankees px-6 font-medium text-white"
      >
        {done ? "Explorar la tienda" : "Volver al inicio"}
      </Link>
    </>
  );
}
