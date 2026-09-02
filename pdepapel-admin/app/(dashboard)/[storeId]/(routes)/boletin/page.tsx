import type { Metadata } from "next";

import { NewsletterSubscribersClient } from "./components/newsletter-subscribers-client";
import { getNewsletterSubscribers } from "./server/get-newsletter-subscribers";

export const metadata: Metadata = {
  title: "Boletín y suscriptores | P de Papel Admin",
  description:
    "Gestiona las suscripciones confirmadas al boletín de P de Papel",
};

export default async function NewsletterPage({
  params,
}: {
  params: { storeId: string };
}) {
  const data = await getNewsletterSubscribers(params.storeId);

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      <NewsletterSubscribersClient storeId={params.storeId} {...data} />
    </div>
  );
}
