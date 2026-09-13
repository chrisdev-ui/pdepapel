import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

import { requiredInProduction } from "./env-rules.mjs";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production"]),
    CLERK_SECRET_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    FRONTEND_STORE_URL: z.string().min(1),
    ADMIN_WEB_URL: z.string().min(1),
    // Optional: comma-separated Clerk user ids allowed into the panel before
    // they own a store (lib/admin-access.ts). Store owners never need it.
    ADMIN_ALLOWED_USER_IDS: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    WOMPI_API_URL: z.string().min(1),
    WOMPI_API_KEY: z.string().min(1),
    WOMPI_API_SECRET: z.string().min(1),
    WOMPI_EVENTS_KEY: z.string().min(1),
    WOMPI_INTEGRITY_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
    CRON_SECRET: z.string().min(1),
    // Internal API authentication for server-to-server calls (webhooks, etc.)
    INTERNAL_API_SECRET: z.string().min(1),
    // Bold: firma los webhooks de pago. Obligatoria — sin ella el HMAC se
    // calcularía con una clave vacía y cualquiera podría falsificar un pago.
    BOLD_SECRET_KEY: z.string().min(1),
    BOLD_ENVIRONMENT: z.enum(["test", "production"]).default("production"),
    // EnvioClick API
    ENVIOCLICK_API_KEY: z.string().min(1),
    // EnvioClick no firma sus webhooks: este secreto viaja en la URL que se
    // configura en su panel (`?token=`) o en la cabecera `x-webhook-token`.
    ENVIOCLICK_WEBHOOK_SECRET: z.string().min(24),
    // WhatsApp Cloud API (vía Dualhook): el token del apretón de manos de Meta
    // (`hub.verify_token`) y el secreto compartido que viaja en la URL del
    // webhook (`?token=`) o en `x-webhook-token`, como con EnvioClick.
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(24),
    // Secreto de la app de Meta: si está, también se acepta la firma
    // `X-Hub-Signature-256` sobre el cuerpo crudo. Opcional mientras no se
    // sepa si Dualhook reenvía la firma original.
    WHATSAPP_APP_SECRET: z.string().min(1).optional(),
    ENVIOCLICK_API_URL: z
      .string()
      .url()
      .default("https://api.envioclickpro.com.co"),
    // MiPaquete API (para códigos DANE)
    MIPAQUETE_API_KEY: z.string().min(1),
    // Upstash Redis (para caché de ubicaciones DANE)
    KV_REST_API_URL: z.string().url(),
    KV_REST_API_TOKEN: z.string().min(1),
    KV_REST_API_READ_ONLY_TOKEN: z.string().min(1).optional(),
    // GA4 Measurement Protocol credentials for server-side purchase events.
    // Optional for local, CI, and Preview builds; mandatory for Vercel
    // Production builds so a missing value fails the deploy instead of
    // silently dropping the events (see lib/env-rules.mjs).
    GA4_MEASUREMENT_ID: requiredInProduction(
      z
        .string()
        .regex(/^G-[A-Z0-9]+$/, "Debe ser un ID de medición válido de GA4"),
    ),
    GA4_API_SECRET: requiredInProduction(z.string().min(1)),
    GEMINI_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    // Signs the store-bound token in the hosted Google Merchant feed URL.
    // Optional: without it the feed route answers 404 and nothing is exposed.
    GOOGLE_MERCHANT_FEED_SECRET: z.string().min(16).optional(),
    // Signs the early-access links sent to newsletter subscribers. Optional:
    // without it the early-access campaign cannot be sent.
    NEWSLETTER_EARLY_ACCESS_SECRET: z.string().min(16).optional(),
  },
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().optional(),
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1),
    NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME: z.string().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL:
      process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL:
      process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME:
      process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME,
  },
});
