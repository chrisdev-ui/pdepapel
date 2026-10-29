"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import { postPreorderWaitlistSignup } from "@/actions/post-preorder-waitlist";
import { BotChallengeSlot, BotTrapField, useBotTrap } from "@/components/bot-trap";
import { Checkbox } from "@/components/ui/checkbox";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { LEGAL_VERSIONS } from "@/lib/legal-versions";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const PREORDER_WAITLIST_CONSENT_TEXT = "Acepto que P de Papel me contacte por WhatsApp o correo solo sobre esta preventa.";
export const PREORDER_WAITLIST_SUCCESS = "Listo, te avisamos cuando abra la preventa o llegue.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface PreorderWaitlistFormProps {
  productId: string;
  productName: string;
}

type Status = "idle" | "sending" | "done";

/** «Avísame»: nombre y WhatsApp o correo. No envía nada automático; P de Papel contacta a mano. */
export function PreorderWaitlistForm({ productId, productName }: PreorderWaitlistFormProps) {
  const id = useId();
  const botTrap = useBotTrap();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!name.trim()) return "Escribe tu nombre.";
    const hasPhone = phone.replace(/\D/g, "").length >= 7;
    const hasEmail = EMAIL_PATTERN.test(email.trim());
    if (!phone.trim() && !email.trim()) return "Escribe tu WhatsApp o tu correo.";
    if (phone.trim() && !hasPhone) return "Revisa tu número de WhatsApp.";
    if (email.trim() && !hasEmail) return "Revisa tu correo.";
    if (!consent) return "Marca la casilla para que podamos contactarte.";
    return null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;
    try {
      setStatus("sending");
      const response = await postPreorderWaitlistSignup(
        {
          productId,
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          consentText: PREORDER_WAITLIST_CONSENT_TEXT,
          consentVersion: LEGAL_VERSIONS.privacy,
        },
        await botTrap.fields(),
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(result?.message ?? "No pudimos anotarte. Inténtalo más tarde.");
      }
      setStatus("done");
      trackCustomerEvent("waitlist_signup", { item_id: productId, signup_channel: "web" });
    } catch (failure) {
      setStatus("idle");
      setError(failure instanceof Error ? failure.message : "No pudimos anotarte. Inténtalo más tarde.");
    }
  };

  if (status === "done") {
    return (
      <p role="status" className="rounded-lg bg-white px-4 py-3 font-sans text-sm font-semibold text-blue-yankees">
        {PREORDER_WAITLIST_SUCCESS}
      </p>
    );
  }

  const sending = status === "sending";
  const inputClass =
    "h-11 w-full rounded-lg border border-blue-yankees/30 bg-white px-3 font-sans text-base text-blue-yankees focus:outline-none focus:ring-2 focus:ring-blue-yankees disabled:opacity-60";

  return (
    <form onSubmit={submit} noValidate aria-label={`Avísame de la preventa de ${productName}`} className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="font-sans text-sm font-medium text-blue-yankees">
          Nombre
        </label>
        <input
          id={`${id}-name`}
          type="text"
          autoComplete="given-name"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={sending}
          className={inputClass}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-phone`} className="font-sans text-sm font-medium text-blue-yankees">
            WhatsApp
          </label>
          <input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={sending}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-email`} className="font-sans text-sm font-medium text-blue-yankees">
            Correo
          </label>
          <input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={191}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={sending}
            className={inputClass}
          />
        </div>
      </div>
      <p className="font-sans text-xs text-blue-yankees/80">Con uno de los dos basta.</p>

      <div className="flex min-h-11 items-start gap-3">
        <Checkbox
          id={`${id}-consent`}
          checked={consent}
          onCheckedChange={(value) => setConsent(value === true)}
          disabled={sending}
          className="mt-0.5 h-5 w-5 border-blue-yankees bg-white"
        />
        <label htmlFor={`${id}-consent`} className="font-sans text-xs leading-5 text-blue-yankees">
          {PREORDER_WAITLIST_CONSENT_TEXT}{" "}
          <Link href={STOREFRONT_ROUTES.dataPolicy} className="underline underline-offset-2">
            Política de privacidad
          </Link>
          .
        </label>
      </div>

      <BotTrapField trap={botTrap} />
      <BotChallengeSlot trap={botTrap} />

      {error ? (
        <p role="alert" className="font-sans text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={sending}
        className="inline-flex h-11 items-center justify-center rounded-full bg-blue-yankees px-6 font-sans text-sm font-bold text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {sending ? "Enviando…" : "Avísame"}
      </button>
    </form>
  );
}

export default PreorderWaitlistForm;
