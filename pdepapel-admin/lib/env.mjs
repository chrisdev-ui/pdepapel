import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production"]),
    CLERK_SECRET_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    FRONTEND_STORE_URL: z.string().min(1),
    ADMIN_WEB_URL: z.string().min(1),
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    WOMPI_API_URL: z.string().min(1),
    WOMPI_API_KEY: z.string().min(1),
    WOMPI_API_SECRET: z.string().min(1),
    WOMPI_EVENTS_KEY: z.string().min(1),
    WOMPI_INTEGRITY_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
    PAYU_MERCHANT_ID: z.string().min(1),
    PAYU_API_KEY: z.string().min(1),
    CRON_SECRET: z.string().min(1),
    // Internal API authentication for server-to-server calls (webhooks, etc.)
    INTERNAL_API_SECRET: z.string().min(1),
    // EnvioClick API
    ENVIOCLICK_API_KEY: z.string().min(1),
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
  },
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().min(1),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().min(1),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().min(1),
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
    NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME:
      process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  },
  // Skip validation if explicitly requested OR in CI environment (Vercel builds)
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION ||
    !!process.env.CI ||
    !!process.env.VERCEL,
  emptyStringAsUndefined: true,
});
