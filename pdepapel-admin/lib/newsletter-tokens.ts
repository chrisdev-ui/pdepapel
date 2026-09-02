import { createHash, randomBytes } from "node:crypto";

export function normalizeNewsletterEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export function hashNewsletterToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createNewsletterToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(32).toString("base64url");

  return { token, tokenHash: hashNewsletterToken(token) };
}

export function normalizeNewsletterSource(source?: string | null): string {
  const normalizedSource = source?.trim().slice(0, 120);
  if (!normalizedSource || !normalizedSource.startsWith("/")) return "/";

  return normalizedSource;
}
