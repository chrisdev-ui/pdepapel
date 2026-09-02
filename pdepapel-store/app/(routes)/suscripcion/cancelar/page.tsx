import type { Metadata } from "next";

import { Container } from "@/components/ui/container";

import { UnsubscribeClient } from "./unsubscribe-client";

export const metadata: Metadata = {
  title: "Cancelar suscripción | P de Papel",
  robots: { index: false, follow: false },
};

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  return (
    <Container
      component="main"
      className="flex min-h-[60vh] items-center justify-center py-12"
    >
      <section className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm sm:p-10">
        <UnsubscribeClient token={searchParams.token ?? ""} />
      </section>
    </Container>
  );
}
