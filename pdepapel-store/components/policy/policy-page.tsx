import { ChevronDown, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Icons } from "@/components/icons";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const POLICY_CONTACT = {
  phoneDisplay: "(+57) 313 258 2293",
  whatsappUrl:
    "https://wa.me/573132582293?text=" +
    encodeURIComponent("¡Hola! Tengo una duda sobre las políticas de la tienda."),
  email: "papeleria.pdepapel@gmail.com",
  hours: "todos los días de 8:00 a. m. a 8:00 p. m.",
  responseTime: "12 a 24 horas",
} as const;

export interface PolicySection {
  id: string;
  title: string;
  content: ReactNode;
}

export interface PolicyFact {
  icon: LucideIcon;
  tint: string;
  value: string;
  label: string;
}

interface PolicyPageProps {
  eyebrow: string;
  eyebrowIcon: LucideIcon;
  eyebrowClassName: string;
  title: string;
  lede: string;
  /** ISO date; rendered in Spanish. */
  updatedAt: string;
  facts?: PolicyFact[];
  sections: PolicySection[];
  /** Question shown in the contact block ("¿Tienes una duda sobre tu envío?"). */
  contactPrompt: string;
  currentRoute: string;
}

const POLICY_LINKS = [
  { href: STOREFRONT_ROUTES.shippingPolicy, label: "Envíos y entregas" },
  { href: STOREFRONT_ROUTES.returnsPolicy, label: "Cambios y devoluciones" },
  { href: STOREFRONT_ROUTES.dataPolicy, label: "Datos personales" },
];

function formatUpdatedAt(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function TocLinks({ sections, className }: { sections: PolicySection[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-0.5", className)}>
      {sections.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="flex min-h-[40px] items-center rounded-full px-3 text-sm text-foreground hover:bg-kawaii-pink-light/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink"
          >
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Shared layout for the three policy pages: same hero as Contacto/Nosotros,
 * a table of contents (sticky on desktop, collapsible on phones), h2
 * sections with anchors, and the same contact block everywhere.
 */
export function PolicyPage({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  eyebrowClassName,
  title,
  lede,
  updatedAt,
  facts,
  sections,
  contactPrompt,
  currentRoute,
}: PolicyPageProps) {
  const otherPolicies = POLICY_LINKS.filter((link) => link.href !== currentRoute);
  const updatedLabel = formatUpdatedAt(updatedAt);

  return (
    <>
      <section className="sparkle relative overflow-hidden bg-kawaii-pink-light/15 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-kawaii-lavender-light blur-3xl"
        />
        <div className="relative mx-auto flex max-w-screen-2xl flex-col gap-3">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex items-center gap-2">
              <li>
                <Link href={STOREFRONT_ROUTES.home} className="hover:underline">
                  Inicio
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li>Políticas</li>
              <li aria-hidden="true">›</li>
              <li aria-current="page" className="font-semibold text-foreground">
                {title}
              </li>
            </ol>
          </nav>
          <span
            className={cn(
              "inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold",
              eyebrowClassName,
            )}
          >
            <EyebrowIcon aria-hidden="true" className="h-4 w-4" />
            {eyebrow}
          </span>
          <h1 className="text-balance font-serif text-4xl font-bold text-blue-yankees sm:text-5xl">
            {title}
          </h1>
          <p className="text-pretty max-w-2xl text-muted-foreground sm:text-lg">{lede}</p>
          <p className="text-sm text-muted-foreground">
            Última actualización:{" "}
            <time dateTime={updatedAt}>{updatedLabel}</time>
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-screen-2xl items-start gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14 lg:px-8 lg:py-12">
        <aside className="lg:sticky lg:top-[calc(var(--storefront-header-offset)+16px)]">
          <details className="rounded-2xl border border-pink-shell/30 bg-white p-2 shadow-sm lg:hidden">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between px-3 font-sans text-sm font-semibold text-blue-yankees [&::-webkit-details-marker]:hidden">
              En esta página
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </summary>
            <nav aria-label="Contenido de la política" className="pb-1 pt-1">
              <TocLinks sections={sections} />
            </nav>
          </details>
          <nav aria-label="Contenido de la política" className="hidden lg:block">
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              En esta página
            </p>
            <TocLinks sections={sections} />
            <div className="my-3 border-t border-border" />
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Otras políticas
            </p>
            <ol className="flex flex-col gap-0.5">
              {otherPolicies.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex min-h-[40px] items-center rounded-full px-3 text-sm text-foreground hover:bg-kawaii-pink-light/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col gap-10">
          {facts && facts.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-3">
              {facts.map((fact) => (
                <li
                  key={fact.label}
                  className="flex items-center gap-3 rounded-2xl border border-pink-shell/30 bg-white p-4 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-blue-yankees",
                      fact.tint,
                    )}
                  >
                    <fact.icon className="h-5 w-5" />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-sans text-[15px] font-bold text-blue-yankees">{fact.value}</span>
                    <span className="text-[13px] text-muted-foreground">{fact.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-titulo`}
              className="flex scroll-mt-[calc(var(--storefront-header-offset)+16px)] flex-col gap-3"
            >
              <h2 id={`${section.id}-titulo`} className="font-serif text-2xl font-bold text-blue-yankees">
                {section.title}
              </h2>
              <div className="policy-prose flex max-w-3xl flex-col gap-3 text-[15px] leading-relaxed text-foreground [&_a]:font-semibold [&_a]:text-blue-yankees [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
                {section.content}
              </div>
            </section>
          ))}

          <section
            aria-labelledby="politica-contacto"
            className="flex flex-col gap-4 rounded-3xl border border-pink-shell/30 bg-kawaii-lavender-light/25 p-6 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 id="politica-contacto" className="font-serif text-xl font-bold text-blue-yankees">
                {contactPrompt}
              </h2>
              <p className="text-sm text-muted-foreground">
                Escríbenos con tu número de pedido. Respondemos en {POLICY_CONTACT.responseTime},{" "}
                {POLICY_CONTACT.hours}.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href={POLICY_CONTACT.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-blue-yankees px-5 font-sans text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
              >
                <Icons.whatsapp className="h-4 w-4" aria-hidden="true" />
                WhatsApp {POLICY_CONTACT.phoneDisplay}
              </a>
              <a
                href={`mailto:${POLICY_CONTACT.email}`}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-[1.5px] border-blue-yankees bg-white px-5 font-sans text-sm font-semibold text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Correo
              </a>
            </div>
          </section>

          <nav aria-label="Otras políticas" className="flex flex-wrap gap-2 lg:hidden">
            {otherPolicies.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-[40px] items-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-blue-yankees"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
