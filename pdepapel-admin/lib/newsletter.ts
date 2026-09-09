import { DiscountType, NewsletterSubscriberStatus } from "@prisma/client";
import { addDays, addHours, subMinutes } from "date-fns";
import { randomBytes } from "node:crypto";
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
export const NEWSLETTER_WELCOME_DISCOUNT_PERCENT = 10;
export const NEWSLETTER_WELCOME_COUPON_DAYS = 30;
const WELCOME_COUPON_PREFIX = "BIENVENIDA";

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
  productId: z.string().trim().max(64).optional(),
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
  coupon: { code: string; endDate: Date } | null,
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
    react: NewsletterWelcome({
      shopUrl,
      unsubscribeUrl,
      couponCode: coupon?.code ?? null,
      couponPercent: NEWSLETTER_WELCOME_DISCOUNT_PERCENT,
      couponEndsAt: coupon?.endDate ?? null,
    }) as React.ReactElement,
    text: [
      "Tu suscripción está confirmada.",
      coupon ? `Tu código de ${NEWSLETTER_WELCOME_DISCOUNT_PERCENT} % en tu primera compra: ${coupon.code} (vence el ${formatEmailDate(coupon.endDate)}).` : null,
      `Explora la tienda: ${shopUrl}`,
      `Cancelar suscripción: ${unsubscribeUrl}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    headers: {
      "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (error) throw new Error(error.message);
}

export function formatEmailDate(value: Date): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" }).format(value);
}

function welcomeCouponCode(): string {
  return `${WELCOME_COUPON_PREFIX}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function issueWelcomeCoupon(storeId: string, subscriberId: string) {
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prismadb.$transaction(async (tx) => {
        const coupon = await tx.coupon.create({
          data: {
            storeId,
            code: welcomeCouponCode(),
            type: DiscountType.PERCENTAGE,
            amount: NEWSLETTER_WELCOME_DISCOUNT_PERCENT,
            startDate: now,
            endDate: addDays(now, NEWSLETTER_WELCOME_COUPON_DAYS),
            maxUses: 1,
            minOrderValue: 0,
          },
          select: { id: true, code: true, endDate: true },
        });
        await tx.newsletterSubscriber.update({
          where: { id: subscriberId },
          data: { welcomeCouponId: coupon.id },
        });
        return coupon;
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "P2002" || attempt === 4) throw error;
    }
  }
  return null;
}

export async function requestNewsletterSubscription(input: {
  storeId: string;
  email: string;
  source?: string;
  interestProductId?: string | null;
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
      interestProductId: input.interestProductId ?? null,
      consentText: NEWSLETTER_CONSENT_TEXT,
      consentVersion: NEWSLETTER_CONSENT_VERSION,
      consentedAt: now,
    },
    update: {
      email: input.email.trim(),
      source: normalizeNewsletterSource(input.source),
      ...(input.interestProductId ? { interestProductId: input.interestProductId } : {}),
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

  let coupon: { code: string; endDate: Date } | null = null;
  if (!subscriber.welcomeCouponId) {
    try {
      coupon = await issueWelcomeCoupon(subscriber.storeId, subscriber.id);
    } catch (error) {
      console.error("[NEWSLETTER_WELCOME_COUPON]", error);
    }
  }

  try {
    await sendWelcomeEmail(
      subscriber.storeId,
      subscriber.email,
      unsubscribeToken,
      coupon,
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

export async function unsubscribeNewsletterByHash(storeId: string, hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) return { status: "invalid" as const };
  const subscriber = await prismadb.newsletterSubscriber.findFirst({
    where: { storeId, unsubscribeTokenHash: hash },
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
