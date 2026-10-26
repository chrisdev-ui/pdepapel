/**
 * Los valores públicos para el código que puede llegar al navegador. Se leen
 * con `process.env.NEXT_PUBLIC_*` literal para que Next los incruste; la
 * validación sigue en `lib/env.mjs`, que corre en el build desde
 * `next.config.mjs`. Importar `env.mjs` desde el cliente metía zod y
 * `@t3-oss/env-nextjs` en todas las páginas.
 */
export const publicEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL as string,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY as string,
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
  NEXT_PUBLIC_CLOUDINARY_PLACEHOLDERS: process.env.NEXT_PUBLIC_CLOUDINARY_PLACEHOLDERS as "0" | "1" | undefined,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  NEXT_PUBLIC_CLARITY_PROJECT_ID: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID,
  NEXT_PUBLIC_CLARITY_ENABLED: process.env.NEXT_PUBLIC_CLARITY_ENABLED as "true" | "false" | undefined,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_TIKTOK_PIXEL_ID: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
};
