import crypto from "crypto";

export const ORDER_ACCOUNT_CLAIM_TTL_MS = 30 * 60 * 1000;

export const hashOrderAccountClaimToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const createOrderAccountClaimToken = () => {
  const token = crypto.randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashOrderAccountClaimToken(token),
    expiresAt: new Date(Date.now() + ORDER_ACCOUNT_CLAIM_TTL_MS),
  };
};

export const normalizeOrderAccountEmail = (
  email: string | null | undefined,
): string | null => {
  const normalizedEmail = email?.trim().toLowerCase();

  return normalizedEmail || null;
};

export const hasMatchingOrderAccountEmail = (
  orderEmail: string | null | undefined,
  verifiedUserEmail: string | null | undefined,
): boolean => {
  const normalizedOrderEmail = normalizeOrderAccountEmail(orderEmail);
  const normalizedUserEmail = normalizeOrderAccountEmail(verifiedUserEmail);

  return Boolean(
    normalizedOrderEmail &&
      normalizedUserEmail &&
      normalizedOrderEmail === normalizedUserEmail,
  );
};
