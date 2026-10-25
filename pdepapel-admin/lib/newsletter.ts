import { DiscountType, NewsletterSubscriberStatus } from "@prisma/client";
import { addDays, addHours, subHours, subMinutes } from "date-fns";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { NewsletterConfirmation } from "@/emails/newsletter-confirmation";
import { NewsletterWelcome } from "@/emails/newsletter-welcome";
import { env } from "@/lib/env.mjs";
import {
  createNewsletterToken,
  hashNewsletterToken,
  newsletterEmailKey,
  newsletterEmailLookupKeys,
  normalizeNewsletterSource,
} from "@/lib/newsletter-tokens";
import { runInBackground } from "@/lib/background";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import { socialLinksText, withSocialLinks } from "@/lib/social-links";

export const NEWSLETTER_CONSENT_VERSION = "2026-09-01";
export const NEWSLETTER_CONSENT_TEXT =
  "Autorizo a P de Papel a enviarme hasta dos correos al mes con novedades, lanzamientos y ofertas. Puedo cancelar mi suscripción cuando quiera.";
// Una por dirección al día: las altas falsas usaban direcciones de terceros y
// cada correo de más es una queja posible contra el dominio.
export const CONFIRMATION_COOLDOWN_HOURS = 24;
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
    text: withSocialLinks(`Confirma tu suscripción a P de Papel: ${confirmationUrl}\n\nEl enlace vence en 48 horas. Si no lo solicitaste, ignora este mensaje.`),
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
      socialLinksText(),
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

type ExistingSubscriber = { id: string; status: NewsletterSubscriberStatus };

/**
 * Las filas viejas de Gmail se guardaron con puntos (`j.ohn` en gmail): se
 * buscan por la llave exacta y, si no aparece, entre las de Gmail que dan la
 * misma llave nueva. Un activo o bloqueado gana sobre un pendiente.
 */
async function findExistingSubscribers(storeId: string, email: string): Promise<ExistingSubscriber[]> {
  const key = newsletterEmailKey(email);
  const exact = await prismadb.newsletterSubscriber.findMany({
    where: { storeId, emailNormalized: { in: newsletterEmailLookupKeys(email) } },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  if (exact.length > 0 || !key.endsWith("@gmail.com")) return exact;

  const candidates = await prismadb.newsletterSubscriber.findMany({
    where: {
      storeId,
      emailNormalized: { startsWith: key.charAt(0) },
      OR: [{ emailNormalized: { endsWith: "@gmail.com" } }, { emailNormalized: { endsWith: "@googlemail.com" } }],
    },
    select: { id: true, status: true, emailNormalized: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return candidates.filter((row) => newsletterEmailKey(row.emailNormalized) === key).map(({ id, status }) => ({ id, status }));
}

export async function requestNewsletterSubscription(input: {
  storeId: string;
  email: string;
  source?: string;
  interestProductId?: string | null;
}) {
  const matches = await findExistingSubscribers(input.storeId, input.email);
  if (
    matches.some(
      (row) =>
        row.status === NewsletterSubscriberStatus.ACTIVE ||
        row.status === NewsletterSubscriberStatus.SUPPRESSED,
    )
  ) {
    return { accepted: true, confirmationSent: false };
  }

  const now = new Date();
  const fields = {
    email: input.email.trim(),
    source: normalizeNewsletterSource(input.source),
    consentText: NEWSLETTER_CONSENT_TEXT,
    consentVersion: NEWSLETTER_CONSENT_VERSION,
    consentedAt: now,
  };
  const updateExisting = (id: string) =>
    prismadb.newsletterSubscriber.update({
      where: { id },
      data: { ...fields, ...(input.interestProductId ? { interestProductId: input.interestProductId } : {}) },
      select: { id: true, email: true },
    });

  let subscriber: { id: string; email: string };
  if (matches[0]) {
    subscriber = await updateExisting(matches[0].id);
  } else {
    try {
      subscriber = await prismadb.newsletterSubscriber.create({
        data: {
          ...fields,
          storeId: input.storeId,
          emailNormalized: newsletterEmailKey(input.email),
          interestProductId: input.interestProductId ?? null,
        },
        select: { id: true, email: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const [raced] = await findExistingSubscribers(input.storeId, input.email);
      if (!raced) throw error;
      if (raced.status !== NewsletterSubscriberStatus.PENDING && raced.status !== NewsletterSubscriberStatus.UNSUBSCRIBED) {
        return { accepted: true, confirmationSent: false };
      }
      subscriber = await updateExisting(raced.id);
    }
  }

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
        { lastConfirmationSentAt: null },
        {
          lastConfirmationSentAt: {
            lte: subHours(now, CONFIRMATION_COOLDOWN_HOURS),
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

export type NewsletterTokenStatus = "valid" | "already_confirmed" | "expired" | "invalid";

/**
 * El enlace del correo se queda con su hash al confirmar: así la página puede
 * decir «ya estaba confirmada» en vez de «enlace inválido». Una baja o un
 * nuevo envío lo borran o lo reemplazan.
 */
function tokenStatus(
  subscriber: { status: NewsletterSubscriberStatus; confirmationExpiresAt: Date | null } | null,
  now = Date.now(),
): NewsletterTokenStatus {
  if (!subscriber) return "invalid";
  if (subscriber.status === NewsletterSubscriberStatus.ACTIVE) return "already_confirmed";
  if (subscriber.status !== NewsletterSubscriberStatus.PENDING) return "invalid";
  if (!subscriber.confirmationExpiresAt || subscriber.confirmationExpiresAt.getTime() < now) return "expired";
  return "valid";
}

/** Solo lectura: lo que usa la página de la tienda para mostrar el botón. Un escáner de enlaces que la abra no confirma nada. */
export async function checkNewsletterConfirmationToken(storeId: string, token: string): Promise<{ status: NewsletterTokenStatus }> {
  const subscriber = await prismadb.newsletterSubscriber.findFirst({
    where: { storeId, confirmationTokenHash: hashNewsletterToken(token) },
    select: { status: true, confirmationExpiresAt: true },
  });
  return { status: tokenStatus(subscriber) };
}

export async function confirmNewsletterSubscription(
  storeId: string,
  token: string,
) {
  const tokenHash = hashNewsletterToken(token);
  const subscriber = await prismadb.newsletterSubscriber.findFirst({
    where: { storeId, confirmationTokenHash: tokenHash },
  });

  const current = tokenStatus(subscriber);
  if (!subscriber || current !== "valid") {
    return { status: current as Exclude<NewsletterTokenStatus, "valid"> };
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
      confirmationExpiresAt: null,
      unsubscribeTokenHash,
      lastWelcomeSentAt: confirmedAt,
    },
  });

  if (confirmed.count === 0) {
    const raced = await prismadb.newsletterSubscriber.findFirst({
      where: { storeId, confirmationTokenHash: tokenHash },
      select: { status: true, confirmationExpiresAt: true },
    });
    return { status: tokenStatus(raced) === "already_confirmed" ? ("already_confirmed" as const) : ("invalid" as const) };
  }

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

/**
 * Casilla «quiero el boletín» del pago: el pedido ya pasó la trampa, el reloj y
 * Turnstile, así que el alta va del panel y no pide un segundo desafío después
 * de pagar (antes se perdía al redirigir a la pasarela).
 */
export function subscribeFromStoreOrder(input: {
  storeId: string;
  email: unknown;
  optIn: unknown;
  isStoreOwner: boolean;
}): boolean {
  if (input.isStoreOwner || input.optIn !== true) return false;
  const email = z.string().trim().email().max(320).safeParse(input.email);
  if (!email.success) return false;
  runInBackground("alta al boletín desde el pago", async () => {
    try {
      await requestNewsletterSubscription({ storeId: input.storeId, email: email.data, source: "/finalizar-compra" });
    } catch (error) {
      console.error("[NEWSLETTER] Alta desde el pago falló:", error);
    }
  });
  return true;
}

