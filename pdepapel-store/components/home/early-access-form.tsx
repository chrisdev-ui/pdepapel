"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { useToast } from "@/hooks/use-toast";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

interface EarlyAccessFormProps {
  label: string;
  source: string;
  productId?: string;
  className?: string;
  /** Sin botón de apertura: el campo se muestra de una vez. */
  open?: boolean;
}

type Status = "idle" | "open" | "sending" | "done";

/** Botón que se convierte en el campo de correo en su mismo lugar. */
export function EarlyAccessForm({ label, source, productId, className, open = false }: EarlyAccessFormProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>(open ? "open" : "idle");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const inputId = useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!consent) {
      toast({ description: "Autoriza el envío de novedades para continuar.", variant: "warning" });
      return;
    }
    try {
      setStatus("sending");
      trackCustomerEvent("newsletter_signup_submitted", { source });
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent: true, source, productId, company: "" }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "No pudimos iniciar la suscripción");
      setStatus("done");
      trackCustomerEvent("newsletter_confirmation_requested", { source });
    } catch (error) {
      setStatus("open");
      toast({
        title: "¡Ups! Algo salió mal.",
        description: error instanceof Error ? error.message : "Inténtalo de nuevo más tarde.",
        variant: "destructive",
      });
    }
  };

  if (status === "done") {
    return (
      <p role="status" className={cn("inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 font-sans text-sm font-semibold text-green-700", className)}>
        <Check aria-hidden="true" className="h-4 w-4" />
        Revisa tu correo y confirma: ahí va tu código
      </p>
    );
  }

  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStatus("open")}
        className={cn("inline-flex h-12 items-center justify-center rounded-full bg-blue-yankees px-6 font-sans text-base font-bold text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2", className)}
      >
        {label}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className={cn("flex w-full max-w-md flex-col gap-2", className)}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">
          Correo electrónico
        </label>
        <input
          id={inputId}
          type="email"
          required
          autoFocus
          inputMode="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={status === "sending"}
          className="h-12 min-w-0 flex-1 rounded-full border border-transparent bg-white px-4 font-sans text-base text-blue-yankees focus:outline-none focus:ring-2 focus:ring-blue-yankees"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-yankees px-5 font-sans text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-60"
        >
          {status === "sending" ? "Enviando…" : "Avisarme"}
        </button>
      </div>
      <label className="flex items-start gap-2 font-sans text-xs leading-5 text-blue-yankees">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 rounded border-blue-yankees" />
        <span>
          Autorizo hasta dos correos al mes con novedades y ofertas. Puedo cancelar cuando quiera.{" "}
          <Link href={STOREFRONT_ROUTES.dataPolicy} className="underline underline-offset-2">
            Política de datos
          </Link>
          .
        </span>
      </label>
    </form>
  );
}
