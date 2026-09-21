import type { Metadata } from "next";

import { requireStoreOwner } from "@/lib/store-access";
import { env } from "@/lib/env.mjs";

import { NewsletterSubscribersClient } from "./components/newsletter-subscribers-client";
import { getNewsletterSubscribers } from "./server/get-newsletter-subscribers";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Boletín | PdePapel Admin",
  description:
    "Gestiona las suscripciones confirmadas al boletín de P de Papel",
};

/**
 * Solo la dueña: correos de las suscriptoras y el botón que les escribe. La
 * guardia también la declara el cargador —es quien toca los datos y es lo que
 * exige el escáner de accesos—, pero la página lo dice igual, como el resto de
 * los módulos.
 */
export default async function NewsletterPage({
  params,
}: {
  params: { storeId: string };
}) {
  await requireStoreOwner(params.storeId);
  const data = await getNewsletterSubscribers(params.storeId);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <NewsletterSubscribersClient
        storeId={params.storeId}
        storefrontUrl={env.FRONTEND_STORE_URL.replace(/\/$/, "")}
        {...data}
      />
    </div>
  );
}
