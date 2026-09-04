import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

import { requiredInProduction } from "./env-rules.mjs";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production"]),
    CLERK_SECRET_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().min(1),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().min(1),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().min(1),
    NEXT_PUBLIC_API_URL: z.string().min(1),
    NEXT_PUBLIC_PAYU_URL: z.string().min(1),
    NEXT_PUBLIC_PAYU_MERCHANT_ID: z.string().min(1),
    NEXT_PUBLIC_PAYU_ACCOUNT_ID: z.string().min(1),
    NEXT_PUBLIC_PAYU_API_KEY: z.string().min(1),
    // Analytics identifiers are public, not secrets. They are optional for
    // local, CI, and Preview builds but mandatory for Vercel Production builds
    // so a missing value fails the deploy instead of silently disabling GA4
    // and Clarity (see lib/env-rules.mjs).
    NEXT_PUBLIC_GA_MEASUREMENT_ID: requiredInProduction(
      z
        .string()
        .regex(/^G-[A-Z0-9]+$/, "Debe ser un ID de medición válido de GA4"),
    ),
    NEXT_PUBLIC_CLARITY_PROJECT_ID: requiredInProduction(
      z
        .string()
        .regex(/^[a-z0-9]+$/i, "Debe ser un ID de proyecto válido de Clarity"),
    ),
    NEXT_PUBLIC_CLARITY_ENABLED: requiredInProduction(z.enum(["true", "false"])),
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
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_PAYU_URL: process.env.NEXT_PUBLIC_PAYU_URL,
    NEXT_PUBLIC_PAYU_MERCHANT_ID: process.env.NEXT_PUBLIC_PAYU_MERCHANT_ID,
    NEXT_PUBLIC_PAYU_ACCOUNT_ID: process.env.NEXT_PUBLIC_PAYU_ACCOUNT_ID,
    NEXT_PUBLIC_PAYU_API_KEY: process.env.NEXT_PUBLIC_PAYU_API_KEY,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    NEXT_PUBLIC_CLARITY_PROJECT_ID: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID,
    NEXT_PUBLIC_CLARITY_ENABLED: process.env.NEXT_PUBLIC_CLARITY_ENABLED,
  },
});
