import { cache } from "react";

import { withUpstreamTimeout } from "@/lib/catalog-cache";
import { publicEnv as env } from "@/lib/public-env";

export interface NewsletterIssuePage {
  id: string;
  imageUrl: string;
  alt: string | null;
  position: number;
}

export interface NewsletterIssue {
  slug: string;
  title: string;
  intro: string | null;
  coverUrl: string;
  coverAlt: string | null;
  sentAt: string | null;
  pages: NewsletterIssuePage[];
}

/**
 * Un número del boletín ya enviado, por su slug.
 *
 * La API solo devuelve números enviados: un borrador nunca sale, aunque
 * alguien adivine la dirección.
 */
export const getNewsletterIssue = cache(
  async (slug: string): Promise<NewsletterIssue | null> => {
    try {
      const response = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/newsletter/issues?slug=${encodeURIComponent(slug)}`,
        withUpstreamTimeout({ next: { revalidate: 300, tags: ["newsletter-issues"] } }),
      );
      if (!response.ok) return null;
      return (await response.json()) as NewsletterIssue;
    } catch {
      return null;
    }
  },
);
