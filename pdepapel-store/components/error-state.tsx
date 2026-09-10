import { MessageCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { getSupportWhatsAppUrl } from "@/lib/support";
import { cn } from "@/lib/utils";

export type ErrorStateTone = "not-found" | "failure" | "retry";

/** Badge tint per kind of moment: yellow "no está", pink "falló", blue "vuelve a intentar". */
const TONE_CLASSES: Record<ErrorStateTone, string> = {
  "not-found": "bg-kawaii-yellow-light",
  failure: "bg-kawaii-pink-light",
  retry: "bg-kawaii-blue-light",
};

export interface ErrorStateProps {
  tone: ErrorStateTone;
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  /** Primary way forward: a link or a button (retry). */
  primary: ReactNode;
  /** First WhatsApp message, so support knows where the visitor was. */
  whatsappMessage: string;
  /** Quiet third option under the buttons. */
  secondaryLink?: { href: string; label: string };
  /** Next.js error digest, shown small so support can find it in the logs. */
  digest?: string;
  className?: string;
}

/**
 * The one card for "something is missing" and "something broke" moments:
 * icon badge, serif headline, plain explanation, a real next step and the
 * WhatsApp escape hatch. Used by the 404s, the route error boundary and the
 * upstream fallback; `app/global-error.tsx` mirrors it without shared deps.
 */
export function ErrorState({
  tone,
  icon: Icon,
  title,
  description,
  primary,
  whatsappMessage,
  secondaryLink,
  digest,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-[60vh] w-full max-w-screen-2xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8",
        className,
      )}
    >
      <section
        aria-labelledby="error-state-title"
        className="flex w-full max-w-xl flex-col items-center gap-4 rounded-3xl border border-pink-shell/30 bg-white p-8 text-center shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]"
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-14 w-14 items-center justify-center rounded-2xl text-blue-yankees",
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="h-7 w-7" />
        </span>
        <h1
          id="error-state-title"
          className="text-balance font-serif text-3xl font-bold text-blue-yankees"
        >
          {title}
        </h1>
        <p className="text-pretty text-muted-foreground">{description}</p>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {primary}
          <Button
            asChild
            variant="outline"
            className="gap-2 rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees"
          >
            <a
              href={getSupportWhatsAppUrl(whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle aria-hidden="true" className="h-4 w-4" />
              Escribir por WhatsApp
            </a>
          </Button>
        </div>
        {secondaryLink && (
          <Link
            href={secondaryLink.href}
            className="text-sm font-semibold text-blue-yankees underline underline-offset-4"
          >
            {secondaryLink.label}
          </Link>
        )}
        {digest && (
          <p className="text-xs text-muted-foreground">
            Código para soporte: <span className="font-quicksand">{digest}</span>
          </p>
        )}
      </section>
    </div>
  );
}

/** Primary button of the card as a link. */
export function ErrorStateLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild className="rounded-full font-sans font-bold">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

/** Primary button of the card as an action (retry / reset). */
export function ErrorStateAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button type="button" onClick={onClick} className="gap-2 rounded-full font-sans font-bold">
      {children}
    </Button>
  );
}
