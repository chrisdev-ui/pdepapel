"use client";

import { Button } from "@/components/ui/button";
import { requestOrderAction, scrollToOrderSection } from "@/lib/order-actions";
import type { NextStepCard, NextStepLink } from "@/lib/order-timeline";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import type { MouseEvent } from "react";

const TONE_BG: Record<NextStepCard["tone"], string> = {
  cream: "bg-tint-cream border-[#F3E2A0]",
  sky: "bg-tint-sky border-[#B9DDF2]",
  pink: "bg-tint-pink border-[#F5C1DA]",
  mint: "bg-tint-mint border-[#B8E8C8]",
  lavender: "bg-tint-lavender border-[#D0C4F0]",
  slate: "bg-muted border-border",
};

function NextStepButton({ link, primary }: { link: NextStepLink; primary: boolean }) {
  const external = link.href.startsWith("http");
  const anchor = link.href.startsWith("#");

  // Un ancla del formulario se desplaza sin cambiar la URL y, si el paso tiene
  // acción, abre el diálogo correspondiente en la tarjeta de Pago.
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!anchor) return;
    event.preventDefault();
    scrollToOrderSection(link.href);
    if (link.action) requestOrderAction(link.action);
  };

  return (
    <Button asChild size="sm" variant={primary ? "default" : "outline"}>
      <a href={link.href} onClick={onClick} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
        {link.label}
        {external && primary && <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
      </a>
    </Button>
  );
}

/** Tarjeta «Siguiente paso» de la cabecera del pedido: sus botones actúan, no solo enlazan. */
export function NextStepPanel({ next }: { next: NextStepCard }) {
  return (
    <section aria-labelledby="siguiente-paso" className={cn("flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between", TONE_BG[next.tone])}>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="siguiente-paso" className="text-[15px] font-bold text-primary">{next.title}</h2>
        <p className="text-sm text-primary/90">{next.description}</p>
        {next.consequence && <p className="text-xs text-primary/70">{next.consequence}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {next.secondary && <NextStepButton link={next.secondary} primary={false} />}
        <NextStepButton link={next.primary} primary />
      </div>
    </section>
  );
}
