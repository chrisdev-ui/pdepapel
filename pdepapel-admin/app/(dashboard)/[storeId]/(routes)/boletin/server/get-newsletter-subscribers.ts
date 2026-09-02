"use server";

import { auth } from "@clerk/nextjs";
import { NewsletterSubscriberStatus } from "@prisma/client";
import { headers } from "next/headers";

import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";

export async function getNewsletterSubscribers(storeId: string) {
  headers();
  const { userId } = auth();
  if (!userId) throw new Error("No autenticado");
  await verifyStoreOwner(userId, storeId);

  const [subscribers, grouped] = await Promise.all([
    prismadb.newsletterSubscriber.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        status: true,
        source: true,
        consentedAt: true,
        confirmedAt: true,
        unsubscribedAt: true,
        lastConfirmationSentAt: true,
      },
    }),
    prismadb.newsletterSubscriber.groupBy({
      by: ["status"],
      where: { storeId },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<NewsletterSubscriberStatus, number> = {
    PENDING: 0,
    ACTIVE: 0,
    UNSUBSCRIBED: 0,
    SUPPRESSED: 0,
  };
  for (const group of grouped) counts[group.status] = group._count._all;

  return {
    subscribers: subscribers.map((subscriber) => ({
      ...subscriber,
      consentedAt: subscriber.consentedAt.toISOString(),
      confirmedAt: subscriber.confirmedAt?.toISOString() ?? null,
      unsubscribedAt: subscriber.unsubscribedAt?.toISOString() ?? null,
      lastConfirmationSentAt:
        subscriber.lastConfirmationSentAt?.toISOString() ?? null,
    })),
    counts,
    total: subscribers.length,
  };
}

export type NewsletterSubscriberRow = Awaited<
  ReturnType<typeof getNewsletterSubscribers>
>["subscribers"][number];
