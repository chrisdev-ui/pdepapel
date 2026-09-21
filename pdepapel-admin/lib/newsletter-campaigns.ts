import { NewsletterIssueStatus, NewsletterSubscriberStatus } from "@prisma/client";
import { addDays } from "date-fns";

import { NewsletterArrival } from "@/emails/newsletter-arrival";
import { NewsletterIssueEmail } from "@/emails/newsletter-issue";
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

/**
 * Deja constancia del envío.
 *
 * Hasta ahora un envío solo escribía una marca de tiempo en la fila del banner:
 * no había forma de saber a cuántas personas llegó ni de ver los envíos
 * juntos. Lo llaman los tres tipos.
 */
async function recordSend(input: {
  storeId: string;
  kind: string;
  subject: string;
  recipients: number;
  issueId?: string | null;
  homeContentId?: string | null;
}) {
  await prismadb.newsletterCampaignSend.create({
    data: {
      storeId: input.storeId,
      kind: input.kind,
      subject: input.subject.slice(0, 200),
      recipients: input.recipients,
      issueId: input.issueId ?? null,
      homeContentId: input.homeContentId ?? null,
    },
  });
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
    await recordSend({ storeId: input.storeId, kind: "early-access", subject: `Acceso anticipado: ${entry.title}`, recipients: sent, homeContentId: entry.id });
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
  await recordSend({ storeId: input.storeId, kind: "arrival", subject: `Ya llegó: ${entry.title}`, recipients: sent, homeContentId: entry.id });
  return { sent };
}

/**
 * Cuántas personas recibirían un envío ahora mismo.
 *
 * La pantalla lo pide antes de confirmar: un correo enviado no se recoge, así
 * que la cifra tiene que estar delante antes de pulsar.
 */
export async function countNewsletterRecipients(storeId: string) {
  return prismadb.newsletterSubscriber.count({
    where: {
      storeId,
      status: NewsletterSubscriberStatus.ACTIVE,
      unsubscribeTokenHash: { not: null },
    },
  });
}

/**
 * Envía un número del boletín a las suscriptoras confirmadas.
 *
 * Reusa el mismo enviador por lotes, las mismas cabeceras de baja en un clic y
 * el mismo remitente que los otros dos tipos: no hay un segundo camino de
 * envío que mantener. Nada va adjunto; la portada viaja en el cuerpo y las
 * páginas viven en la tienda.
 */
export async function sendNewsletterIssue(input: {
  storeId: string;
  issueId: string;
}) {
  const issue = await prismadb.newsletterIssue.findFirst({
    where: { id: input.issueId, storeId: input.storeId },
    select: {
      id: true,
      slug: true,
      title: true,
      intro: true,
      coverUrl: true,
      coverAlt: true,
      status: true,
      _count: { select: { pages: true } },
    },
  });
  if (!issue) throw ErrorFactory.NotFound("El número no existe");
  if (issue.status === NewsletterIssueStatus.SENT) {
    throw ErrorFactory.Conflict("Este número ya se envió");
  }
  if (issue._count.pages === 0) {
    throw ErrorFactory.InvalidRequest("Sube al menos una página antes de enviar");
  }

  const subscribers = await activeSubscribers(input.storeId);
  if (subscribers.length === 0) {
    throw ErrorFactory.InvalidRequest("No hay suscriptoras confirmadas");
  }

  const issueUrl = storefrontUrl(`/boletin/${issue.slug}`);
  const subject = issue.title;

  const sent = await sendInBatches(
    subscribers.map((subscriber) => {
      const cancelUrl = unsubscribeUrl(
        input.storeId,
        subscriber.unsubscribeTokenHash!,
      );
      return {
        to: subscriber.email,
        subject,
        react: NewsletterIssueEmail({
          title: issue.title,
          intro: issue.intro,
          coverUrl: issue.coverUrl,
          coverAlt: issue.coverAlt,
          issueUrl,
          pageCount: issue._count.pages,
          unsubscribeUrl: cancelUrl,
        }) as React.ReactElement,
        text: `${issue.title}\n\n${issue.intro ?? ""}\n\nVer el número completo: ${issueUrl}\n\nCancelar suscripción: ${cancelUrl}`,
        headers: listHeaders(cancelUrl),
      };
    }),
  );

  await prismadb.newsletterIssue.update({
    where: { id: issue.id },
    data: {
      status: NewsletterIssueStatus.SENT,
      sentAt: new Date(),
      recipients: sent,
    },
  });
  await recordSend({
    storeId: input.storeId,
    kind: "issue",
    subject,
    recipients: sent,
    issueId: issue.id,
  });

  return { sent };
}
