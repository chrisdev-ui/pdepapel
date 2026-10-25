import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { publicEnv as env } from "@/lib/public-env";

import { ConfirmClient, type ConfirmLinkStatus } from "./confirm-client";

export const metadata: Metadata = {
  title: "Confirmar suscripción | P de Papel",
  robots: { index: false, follow: false },
};

/** Solo lee el estado del enlace: confirmar al abrir dejaba que los escáneres de correo confirmaran por la persona. */
async function linkStatus(token: string): Promise<ConfirmLinkStatus> {
  if (!token) return "invalid";
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_API_URL}/newsletter/confirm?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as { status?: string };
    return result.status === "valid" ||
      result.status === "already_confirmed" ||
      result.status === "expired" ||
      result.status === "error"
      ? result.status
      : "invalid";
  } catch {
    return "error";
  }
}

export default async function ConfirmNewsletterPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";
  const status = await linkStatus(token);

  return (
    <Container
      component="main"
      className="flex min-h-[60vh] items-center justify-center py-12"
    >
      <section className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm sm:p-10">
        <ConfirmClient token={token} initialStatus={status} />
      </section>
    </Container>
  );
}
