import type { Metadata } from "next";

export const revalidate = 0;

import { NewsletterSubscribersClient } from "./components/newsletter-subscribers-client";
import { getNewsletterSubscribers } from "./server/get-newsletter-subscribers";

export const metadata: Metadata = {
  title: "Boletín | PdePapel Admin",
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
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <NewsletterSubscribersClient storeId={params.storeId} {...data} />
    </div>
  );
}
