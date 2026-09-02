import { CheckCircle2, CircleAlert, MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { env } from "@/lib/env.mjs";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Confirmar suscripción | P de Papel",
  robots: { index: false, follow: false },
};

async function confirm(token: string) {
  if (!token) return "invalid" as const;
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_API_URL}/newsletter/confirm?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as { status?: string };
    return result.status === "confirmed"
      ? ("confirmed" as const)
      : result.status === "expired"
        ? ("expired" as const)
        : result.status === "error"
          ? ("error" as const)
          : ("invalid" as const);
  } catch {
    return "error" as const;
  }
}

export default async function ConfirmNewsletterPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const status = await confirm(searchParams.token ?? "");
  const confirmed = status === "confirmed";
  const Icon = confirmed
    ? CheckCircle2
    : status === "expired"
      ? MailCheck
      : CircleAlert;

  return (
    <Container
      component="main"
      className="flex min-h-[60vh] items-center justify-center py-12"
    >
      <section className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm sm:p-10">
        <Icon
          className={`mx-auto h-12 w-12 ${confirmed ? "text-emerald-600" : "text-amber-600"}`}
          aria-hidden="true"
        />
        <h1 className="mt-5 font-serif text-3xl font-semibold text-blue-yankees">
          {confirmed
            ? "¡Suscripción confirmada!"
            : status === "expired"
              ? "El enlace ya venció"
              : status === "error"
                ? "No pudimos confirmar ahora"
                : "No pudimos confirmar el enlace"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {confirmed
            ? "Ya puedes recibir nuestras novedades, lanzamientos y ofertas."
            : status === "expired"
              ? "Vuelve a escribir tu correo en el formulario del sitio para recibir uno nuevo."
              : status === "error"
                ? "Tuvimos un problema temporal. Intenta abrir este enlace nuevamente en unos minutos."
                : "El enlace puede ser incorrecto o ya fue utilizado. Puedes solicitar una nueva confirmación desde el formulario."}
        </p>
        <Link
          href={confirmed ? STOREFRONT_ROUTES.shop : STOREFRONT_ROUTES.home}
          className="min-h-11 mt-7 inline-flex items-center justify-center rounded-lg bg-blue-yankees px-6 font-medium text-white"
        >
          {confirmed ? "Explorar la tienda" : "Volver al inicio"}
        </Link>
      </section>
    </Container>
  );
}
