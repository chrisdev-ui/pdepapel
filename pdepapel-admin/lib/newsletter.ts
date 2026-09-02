import { NewsletterSubscriberStatus } from "@prisma/client";
import { addHours, subMinutes } from "date-fns";
import { z } from "zod";

import { NewsletterConfirmation } from "@/emails/newsletter-confirmation";
import { NewsletterWelcome } from "@/emails/newsletter-welcome";
import { env } from "@/lib/env.mjs";
import {
  createNewsletterToken,
  hashNewsletterToken,
  normalizeNewsletterEmail,
  normalizeNewsletterSource,
} from "@/lib/newsletter-tokens";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";

export const NEWSLETTER_CONSENT_VERSION = "2026-09-01";
export const NEWSLETTER_CONSENT_TEXT =
  "Autorizo a P de Papel a enviarme hasta dos correos al mes con novedades, lanzamientos y ofertas. Puedo cancelar mi suscripción cuando quiera.";
const CONFIRMATION_COOLDOWN_MINUTES = 5;
const CONFIRMATION_EXPIRY_HOURS = 48;

export const newsletterSubscriptionSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Ingresa un correo electrónico válido")
    .max(320),
  consent: z.literal(true, {
    errorMap: () => ({ message: "Debes autorizar el envío de novedades" }),
  }),
  source: z.string().trim().max(120).optional(),
  company: z.string().max(0).optional(),
});

export const newsletterTokenSchema = z.object({
  token: z.string().min(32).max(200),
});

function storefrontUrl(path: string): string {
  return new URL(
    path,
    `${env.FRONTEND_STORE_URL.replace(/\/$/, "")}/`,
  ).toString();
}

async function sendConfirmationEmail(email: string, token: string) {
  if (env.NODE_ENV === "development") return;

  const confirmationUrl = storefrontUrl(
    `/suscripcion/confirmar?token=${encodeURIComponent(token)}`,
  );
  const { error } = await resend.emails.send({
    from: "P de Papel <novedades@papeleriapdepapel.com>",
    to: [email],
    subject: "Confirma tu suscripción a P de Papel",
    react: NewsletterConfirmation({ confirmationUrl }) as React.ReactElement,
    text: `Confirma tu suscripción a P de Papel: ${confirmationUrl}\n\nEl enlace vence en 48 horas. Si no lo solicitaste, ignora este mensaje.`,
  });

  if (error) throw new Error(error.message);
}

async function sendWelcomeEmail(
  storeId: string,
  email: string,
  unsubscribeToken: string,
) {
  if (env.NODE_ENV === "development") return;

  const unsubscribeUrl = storefrontUrl(
    `/suscripcion/cancelar?token=${encodeURIComponent(unsubscribeToken)}`,
  );
  const oneClickUnsubscribeUrl = new URL(
    `/api/${encodeURIComponent(storeId)}/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
    `${env.ADMIN_WEB_URL.replace(/\/$/, "")}/`,
  ).toString();
  const shopUrl = storefrontUrl("/tienda");
  const { error } = await resend.emails.send({
    from: "P de Papel <novedades@papeleriapdepapel.com>",
    to: [email],
    subject: "Tu suscripción a P de Papel está lista",
    react: NewsletterWelcome({ shopUrl, unsubscribeUrl }) as React.ReactElement,
    text: `Tu suscripción está confirmada. Explora la tienda: ${shopUrl}\n\nCancelar suscripción: ${unsubscribeUrl}`,
    headers: {
      "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (error) throw new Error(error.message);
}

export async function requestNewsletterSubscription(input: {
  storeId: string;
  email: string;
  source?: string;
}) {
  const emailNormalized = normalizeNewsletterEmail(input.email);
  const existing = await prismadb.newsletterSubscriber.findUnique({
    where: {
      storeId_emailNormalized: { storeId: input.storeId, emailNormalized },
    },
    select: { id: true, status: true },
  });

  if (existing?.status === NewsletterSubscriberStatus.ACTIVE) {
    return { accepted: true, confirmationSent: false };
  }
  if (existing?.status === NewsletterSubscriberStatus.SUPPRESSED) {
    return { accepted: true, confirmationSent: false };
  }

  const now = new Date();
  const subscriber = await prismadb.newsletterSubscriber.upsert({
    where: {
      storeId_emailNormalized: { storeId: input.storeId, emailNormalized },
    },
    create: {
      storeId: input.storeId,
      email: input.email.trim(),
      emailNormalized,
      source: normalizeNewsletterSource(input.source),
      consentText: NEWSLETTER_CONSENT_TEXT,
      consentVersion: NEWSLETTER_CONSENT_VERSION,
      consentedAt: now,
    },
    update: {
      email: input.email.trim(),
      source: normalizeNewsletterSource(input.source),
      consentText: NEWSLETTER_CONSENT_TEXT,
      consentVersion: NEWSLETTER_CONSENT_VERSION,
      consentedAt: now,
    },
    select: { id: true, email: true },
  });

  const { token, tokenHash } = createNewsletterToken();
  const claim = await prismadb.newsletterSubscriber.updateMany({
    where: {
      id: subscriber.id,
      status: {
        in: [
          NewsletterSubscriberStatus.PENDING,
          NewsletterSubscriberStatus.UNSUBSCRIBED,
        ],
      },
      OR: [
        { status: NewsletterSubscriberStatus.UNSUBSCRIBED },
        { lastConfirmationSentAt: null },
        {
          lastConfirmationSentAt: {
            lte: subMinutes(now, CONFIRMATION_COOLDOWN_MINUTES),
          },
        },
      ],
    },
    data: {
      status: NewsletterSubscriberStatus.PENDING,
      confirmedAt: null,
      unsubscribedAt: null,
      confirmationTokenHash: tokenHash,
      confirmationExpiresAt: addHours(now, CONFIRMATION_EXPIRY_HOURS),
      unsubscribeTokenHash: null,
      lastConfirmationSentAt: now,
    },
  });

  if (claim.count === 0) {
    return { accepted: true, confirmationSent: false };
  }

  try {
    await sendConfirmationEmail(subscriber.email, token);
  } catch (error) {
    await prismadb.newsletterSubscriber.updateMany({
      where: { id: subscriber.id, confirmationTokenHash: tokenHash },
      data: { lastConfirmationSentAt: null },
    });
    throw error;
  }

  return { accepted: true, confirmationSent: true };
}

export async function confirmNewsletterSubscription(
  storeId: string,
  token: string,
) {
  const tokenHash = hashNewsletterToken(token);
  const subscriber = await prismadb.newsletterSubscriber.findFirst({
    where: { storeId, confirmationTokenHash: tokenHash },
  });

  if (!subscriber) return { status: "invalid" as const };
  if (
    !subscriber.confirmationExpiresAt ||
    subscriber.confirmationExpiresAt.getTime() < Date.now()
  ) {
    return { status: "expired" as const };
  }

  const { token: unsubscribeToken, tokenHash: unsubscribeTokenHash } =
    createNewsletterToken();
  const confirmedAt = new Date();
  const confirmed = await prismadb.newsletterSubscriber.updateMany({
    where: {
      id: subscriber.id,
      confirmationTokenHash: tokenHash,
      status: NewsletterSubscriberStatus.PENDING,
    },
    data: {
      status: NewsletterSubscriberStatus.ACTIVE,
      confirmedAt,
      unsubscribedAt: null,
      confirmationTokenHash: null,
      confirmationExpiresAt: null,
      unsubscribeTokenHash,
      lastWelcomeSentAt: confirmedAt,
    },
  });

  if (confirmed.count === 0) return { status: "invalid" as const };

  try {
    await sendWelcomeEmail(
      subscriber.storeId,
      subscriber.email,
      unsubscribeToken,
    );
  } catch (error) {
    await prismadb.newsletterSubscriber.updateMany({
      where: { id: subscriber.id, lastWelcomeSentAt: confirmedAt },
      data: { lastWelcomeSentAt: null },
    });
    console.error("[NEWSLETTER_WELCOME_EMAIL]", error);
  }

  return { status: "confirmed" as const };
}

export async function unsubscribeFromNewsletter(
  storeId: string,
  token: string,
) {
  const tokenHash = hashNewsletterToken(token);
  const subscriber = await prismadb.newsletterSubscriber.findFirst({
    where: { storeId, unsubscribeTokenHash: tokenHash },
    select: { id: true, status: true },
  });

  if (!subscriber) return { status: "invalid" as const };
  if (subscriber.status === NewsletterSubscriberStatus.UNSUBSCRIBED) {
    return { status: "unsubscribed" as const };
  }

  await prismadb.newsletterSubscriber.update({
    where: { id: subscriber.id },
    data: {
      status: NewsletterSubscriberStatus.UNSUBSCRIBED,
      unsubscribedAt: new Date(),
      confirmationTokenHash: null,
      confirmationExpiresAt: null,
    },
  });

  return { status: "unsubscribed" as const };
}

export async function resendNewsletterConfirmation(
  storeId: string,
  subscriberId: string,
) {
  const subscriber = await prismadb.newsletterSubscriber.findFirst({
    where: { id: subscriberId, storeId },
  });
  if (!subscriber) throw new Error("Suscriptor no encontrado");
  if (subscriber.status === NewsletterSubscriberStatus.ACTIVE) {
    throw new Error("La suscripción ya está activa");
  }
  if (subscriber.status === NewsletterSubscriberStatus.SUPPRESSED) {
    throw new Error("El correo está bloqueado y no puede recibir mensajes");
  }

  const now = new Date();
  if (
    subscriber.lastConfirmationSentAt &&
    subscriber.lastConfirmationSentAt > subMinutes(now, 1)
  ) {
    throw new Error("Espera un minuto antes de reenviar la confirmación");
  }

  const { token, tokenHash } = createNewsletterToken();
  await prismadb.newsletterSubscriber.update({
    where: { id: subscriber.id },
    data: {
      status: NewsletterSubscriberStatus.PENDING,
      confirmedAt: null,
      unsubscribedAt: null,
      confirmationTokenHash: tokenHash,
      confirmationExpiresAt: addHours(now, CONFIRMATION_EXPIRY_HOURS),
      unsubscribeTokenHash: null,
      lastConfirmationSentAt: now,
    },
  });

  try {
    await sendConfirmationEmail(subscriber.email, token);
  } catch (error) {
    await prismadb.newsletterSubscriber.updateMany({
      where: { id: subscriber.id, confirmationTokenHash: tokenHash },
      data: { lastConfirmationSentAt: null },
    });
    throw error;
  }
}

export async function unsubscribeNewsletterSubscriber(
  storeId: string,
  subscriberId: string,
) {
  const result = await prismadb.newsletterSubscriber.updateMany({
    where: { id: subscriberId, storeId },
    data: {
      status: NewsletterSubscriberStatus.UNSUBSCRIBED,
      unsubscribedAt: new Date(),
      confirmationTokenHash: null,
      confirmationExpiresAt: null,
    },
  });

  if (result.count === 0) throw new Error("Suscriptor no encontrado");
}
