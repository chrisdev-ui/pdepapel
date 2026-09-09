import { NewsletterSubscriberStatus } from "@prisma/client";
import { addDays } from "date-fns";

import { NewsletterArrival } from "@/emails/newsletter-arrival";
import { NewsletterEarlyAccess } from "@/emails/newsletter-early-access";
import { ErrorFactory } from "@/lib/api-errors";
import { createEarlyAccessToken, isEarlyAccessConfigured } from "@/lib/early-access";
import { env } from "@/lib/env.mjs";
import { HOME_CONTENT_ADMIN_SELECT, toPublicHomeContent } from "@/lib/home-content";
import { formatEmailDate } from "@/lib/newsletter";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";

export type NewsletterCampaignKind = "early-access" | "arrival";

const BATCH_SIZE = 100;
const FROM = "P de Papel <novedades@papeleriapdepapel.com>";

function storefrontUrl(path: string): string {
  return new URL(path, `${env.FRONTEND_STORE_URL.replace(/\/$/, "")}/`).toString();
}

function adminUrl(path: string): string {
  return new URL(path, `${env.ADMIN_WEB_URL.replace(/\/$/, "")}/`).toString();
}

async function activeSubscribers(storeId: string) {
  return prismadb.newsletterSubscriber.findMany({
    where: { storeId, status: NewsletterSubscriberStatus.ACTIVE, unsubscribeTokenHash: { not: null } },
    select: { id: true, email: true, unsubscribeTokenHash: true },
    orderBy: { confirmedAt: "asc" },
  });
}

type Message = { to: string; subject: string; react: React.ReactElement; text: string; headers: Record<string, string> };

async function sendInBatches(messages: Message[]) {
  if (env.NODE_ENV === "development") return messages.length;
  let sent = 0;
  for (let index = 0; index < messages.length; index += BATCH_SIZE) {
    const batch = messages.slice(index, index + BATCH_SIZE).map((message) => ({ from: FROM, ...message }));
    const { error } = await resend.batch.send(batch);
    if (error) throw new Error(error.message);
    sent += batch.length;
  }
  return sent;
}

function unsubscribeUrl(storeId: string, unsubscribeTokenHash: string) {
  return adminUrl(`/api/${encodeURIComponent(storeId)}/newsletter/unsubscribe?hash=${encodeURIComponent(unsubscribeTokenHash)}`);
}

function listHeaders(url: string) {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function loadShipmentCampaign(storeId: string, homeContentId: string) {
  const entry = await prismadb.homeContent.findFirst({
    where: { id: homeContentId, storeId, placement: "CAMPAIGN", campaignType: "SHIPMENT" },
    select: { ...HOME_CONTENT_ADMIN_SELECT, products: { ...HOME_CONTENT_ADMIN_SELECT.products, select: { ...HOME_CONTENT_ADMIN_SELECT.products.select, product: { select: { ...HOME_CONTENT_ADMIN_SELECT.products.select.product.select, availableAt: true } } } } },
  });
  if (!entry) throw ErrorFactory.NotFound("El banner de cargamento no existe");
  return entry;
}

export async function sendNewsletterCampaign(input: { storeId: string; homeContentId: string; kind: NewsletterCampaignKind }) {
  const entry = await loadShipmentCampaign(input.storeId, input.homeContentId);
  const products = toPublicHomeContent(entry).products;
  if (products.length === 0) throw ErrorFactory.InvalidRequest("Elige primero los productos del cargamento");

  const subscribers = await activeSubscribers(input.storeId);
  if (subscribers.length === 0) throw ErrorFactory.InvalidRequest("No hay suscriptoras confirmadas");

  const productCards = products.map((product) => ({
    name: product.name,
    imageUrl: product.imageUrl,
    url: storefrontUrl(`/producto/${product.slug || product.id}`),
  }));

  if (input.kind === "early-access") {
    if (entry.earlyAccessSentAt) throw ErrorFactory.Conflict("El acceso anticipado ya se envió");
    if (!isEarlyAccessConfigured()) throw ErrorFactory.InvalidRequest("Falta configurar NEWSLETTER_EARLY_ACCESS_SECRET");
    const latestAvailability = entry.products
      .map((item) => item.product.availableAt)
      .filter((value): value is Date => Boolean(value))
      .reduce<Date | null>((max, value) => (max && max > value ? max : value), null);
    const expiresAt = addDays(latestAvailability ?? new Date(), 2);
    const token = createEarlyAccessToken({ storeId: input.storeId, homeContentId: entry.id, exp: Math.floor(expiresAt.getTime() / 1000) });
    const accessUrl = storefrontUrl(`/acceso-anticipado?token=${encodeURIComponent(token)}`);

    const sent = await sendInBatches(
      subscribers.map((subscriber) => {
        const cancelUrl = unsubscribeUrl(input.storeId, subscriber.unsubscribeTokenHash!);
        return {
          to: subscriber.email,
          subject: `Acceso anticipado: ${entry.title}`,
          react: NewsletterEarlyAccess({ title: entry.title, subtitle: entry.subtitle, accessUrl, products: productCards, expiresAt, unsubscribeUrl: cancelUrl }) as React.ReactElement,
          text: `${entry.title}\n\nCompra antes que nadie con este enlace (vence el ${formatEmailDate(expiresAt)}): ${accessUrl}\n\nCancelar suscripción: ${cancelUrl}`,
          headers: listHeaders(cancelUrl),
        };
      }),
    );
    await prismadb.homeContent.update({ where: { id: entry.id }, data: { earlyAccessSentAt: new Date() } });
    return { sent };
  }

  if (entry.arrivalSentAt) throw ErrorFactory.Conflict("El aviso de llegada ya se envió");
  const newArrivalsUrl = storefrontUrl("/tienda?sortOption=dateAdded");
  const sent = await sendInBatches(
    subscribers.map((subscriber) => {
      const cancelUrl = unsubscribeUrl(input.storeId, subscriber.unsubscribeTokenHash!);
      return {
        to: subscriber.email,
        subject: `Ya llegó: ${entry.title}`,
        react: NewsletterArrival({ title: entry.title, subtitle: entry.subtitle, shopUrl: newArrivalsUrl, products: productCards, unsubscribeUrl: cancelUrl }) as React.ReactElement,
        text: `${entry.title}\n\nYa está en la tienda: ${newArrivalsUrl}\n\nCancelar suscripción: ${cancelUrl}`,
        headers: listHeaders(cancelUrl),
      };
    }),
  );
  await prismadb.homeContent.update({ where: { id: entry.id }, data: { arrivalSentAt: new Date() } });
  return { sent };
}
