import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

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
  },
});
