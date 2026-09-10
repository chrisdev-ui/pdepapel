import { ArrowLeft, Gift, Heart, MapPinned, PackageCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { STOREFRONT_ROUTES } from "@/lib/routes";

const BENEFITS = [
  { icon: PackageCheck, tint: "bg-kawaii-blue-light", text: "Tus pedidos y guías en un solo lugar" },
  { icon: MapPinned, tint: "bg-kawaii-mint-light", text: "Direcciones guardadas para pagar más rápido" },
  { icon: Heart, tint: "bg-kawaii-pink-light", text: "Favoritos en todos tus dispositivos" },
  { icon: Gift, tint: "bg-kawaii-yellow-light", text: "Beneficio de bienvenida en tu primera compra" },
];

interface AuthPageShellProps {
  /** Visible page heading, also announced to assistive tech. */
  title: string;
  description: string;
  /** Where «Volver a la tienda» goes: the sanitized redirect or home. */
  backHref: string;
  children: ReactNode;
}

/**
 * Full-page frame for the sign-in and sign-up routes: a brand panel with the
 * real benefits of an account (desktop) or a compact strip (phones), next to
 * the Clerk card styled with the storefront appearance.
 */
export function AuthPageShell({ title, description, backHref, children }: AuthPageShellProps) {
  return (
    <div className="mx-auto grid max-w-screen-2xl items-stretch gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10 lg:px-8 lg:py-12">
      <aside className="relative hidden overflow-hidden rounded-3xl bg-gradient-to-br from-kawaii-pink-light via-kawaii-lavender-light to-kawaii-blue-light p-8 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="flex items-center gap-3">
          <Image
            src="/images/no-text-transparent-bg.webp"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
            unoptimized
          />
          <span className="font-serif text-2xl font-bold text-blue-yankees">P de Papel</span>
        </div>
        <div className="flex flex-col gap-6">
          <p className="text-balance font-serif text-3xl font-bold leading-tight text-blue-yankees">
            Papelería bonita, con cuenta o sin ella.
          </p>
          <ul className="flex flex-col gap-3">
            {BENEFITS.map((benefit) => (
              <li key={benefit.text} className="flex items-center gap-3 text-[15px] text-blue-yankees">
                <span
                  aria-hidden="true"
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-blue-yankees`}
                >
                  <benefit.icon className="h-[18px] w-[18px]" />
                </span>
                {benefit.text}
              </li>
            ))}
          </ul>
          <p className="text-sm text-blue-yankees/80">
            Puedes comprar como invitada. La cuenta solo guarda lo que tú decides.
          </p>
        </div>
        <Link
          href={backHref}
          className="inline-flex min-h-[44px] w-fit items-center gap-2 font-sans text-sm font-semibold text-blue-yankees underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Volver a la tienda
        </Link>
      </aside>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-kawaii-pink-light to-kawaii-lavender-light p-3.5 lg:hidden">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-yankees"
          >
            <PackageCheck className="h-5 w-5" />
          </span>
          <p className="text-[13px] leading-snug text-blue-yankees">
            <strong>Pedidos, guías y direcciones</strong> en un solo lugar. Comprar sin cuenta también funciona.
          </p>
        </div>

        <section
          aria-labelledby="auth-title"
          className="flex flex-1 flex-col gap-5 rounded-3xl border border-pink-shell/30 bg-white p-5 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)] sm:p-8"
        >
          <div className="flex flex-col gap-1">
            <h1 id="auth-title" className="font-serif text-3xl font-bold text-blue-yankees">
              {title}
            </h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          {children}
        </section>

        <Link
          href={backHref}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 font-sans text-sm font-semibold text-blue-yankees underline underline-offset-4 lg:hidden"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Volver a la tienda
        </Link>
      </div>
    </div>
  );
}
