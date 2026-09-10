import { BarChart3, ExternalLink, PackageCheck, ShoppingBag, Store } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import { env } from "@/lib/env.mjs";

const AREAS = [
  { icon: ShoppingBag, text: "Pedidos, envíos y pagos" },
  { icon: PackageCheck, text: "Inventario, catálogo y proveedores" },
  { icon: Store, text: "Ferias, punto de venta y Mercado Libre" },
  { icon: BarChart3, text: "Reportes tributarios y de negocio" },
];

interface AuthPageShellProps {
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Frame for the admin sign-in page: a brand panel that says what the panel is
 * and who it is for, next to the Clerk card styled with the panel tokens.
 */
export function AuthPageShell({ title, description, children }: AuthPageShellProps) {
  return (
    <div className="min-h-screen bg-muted/40 px-4 py-8 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto grid w-full max-w-5xl items-stretch gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8">
        <aside className="hidden flex-col justify-between rounded-2xl bg-gradient-to-br from-tint-pink via-tint-lavender to-tint-sky p-8 lg:flex">
          <div className="flex items-center gap-3">
            <Image
              src="/images/text-below-transparent-bg.webp"
              alt="P de Papel"
              width={56}
              height={56}
              className="h-14 w-14 object-contain"
              unoptimized
              priority
            />
            <span className="text-lg font-semibold text-primary">Panel de P de Papel</span>
          </div>
          <div className="flex flex-col gap-5">
            <p className="text-2xl font-semibold leading-tight text-primary">
              Todo lo que pasa en la tienda, en un solo lugar.
            </p>
            <ul className="flex flex-col gap-3">
              {AREAS.map((area) => (
                <li key={area.text} className="flex items-center gap-3 text-sm text-primary">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-primary shadow-sm"
                  >
                    <area.icon className="h-4 w-4" />
                  </span>
                  {area.text}
                </li>
              ))}
            </ul>
            <p className="text-sm text-primary/80">
              Acceso solo para el equipo de la tienda. Las cuentas de clientes no entran aquí.
            </p>
          </div>
          <a
            href={env.FRONTEND_STORE_URL}
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
          >
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
            Ir a la tienda
          </a>
        </aside>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 lg:hidden">
            <Image
              src="/images/text-below-transparent-bg.webp"
              alt="P de Papel"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
              unoptimized
              priority
            />
            <span className="font-semibold text-primary">Panel de P de Papel</span>
          </div>
          <section
            aria-labelledby="auth-title"
            className="flex flex-1 flex-col gap-5 rounded-2xl border bg-white p-6 shadow-sm sm:p-8"
          >
            <div className="flex flex-col gap-1">
              <h1 id="auth-title" className="text-2xl font-semibold text-foreground">
                {title}
              </h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {children}
          </section>
          <p className="text-center text-xs text-muted-foreground lg:hidden">
            Acceso solo para el equipo de la tienda.
          </p>
        </div>
      </div>
    </div>
  );
}
