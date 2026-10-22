import { LegalConsentChannel } from "@prisma/client";

import { LEGAL_VERSIONS, parseLegalVersions } from "@/lib/legal-versions";

/**
 * Los campos de consentimiento de un pedido. Solo un pedido de la tienda que
 * no crea la dueña (la frase está encima del botón de pago) y con versiones
 * conocidas; en cualquier otro caso, nada: no se finge un consentimiento.
 */
export function orderLegalConsentData(input: { isStoreOwner: boolean; legalConsent: unknown; now?: Date }) {
  if (input.isStoreOwner) return {};
  const versions = parseLegalVersions(input.legalConsent);
  if (!versions) {
    if (input.legalConsent !== undefined) console.warn("[LEGAL_CONSENT] Versión desconocida en el checkout; el pedido queda sin consentimiento.");
    return {};
  }
  return {
    legalTermsVersion: versions.terms,
    legalPrivacyVersion: versions.privacy,
    legalConsentAt: input.now ?? new Date(),
    legalConsentChannel: LegalConsentChannel.CHECKOUT,
  };
}

export type SignupConsentResult = { recorded: true; evidence: "legal_accepted_at" | "unsafe_metadata" } | { recorded: false; reason: "no_evidence" | "duplicate" };

/**
 * Consentimiento al crear la cuenta (webhook user.created). La prueba fuerte
 * es `legal_accepted_at` (la casilla de Clerk) con las versiones vigentes; si
 * falta, las versiones que el <SignUp> de la tienda puso en unsafeMetadata con
 * la hora de creación. Sin ninguna de las dos no se guarda nada. Idempotente
 * por usuario y canal y por id del mensaje. Solo el id de Clerk.
 */
export async function recordSignupConsent(input: {
  clerkUserId: string;
  legalAcceptedAt: number | null | undefined;
  createdAt: number | null | undefined;
  unsafeMetadata: unknown;
  eventId: string | null;
}): Promise<SignupConsentResult> {
  const { default: prismadb } = await import("@/lib/prismadb");
  let versions: { terms: string; privacy: string } | null = null;
  let consentedAt: Date | null = null;
  let evidence: "legal_accepted_at" | "unsafe_metadata" | null = null;

  if (typeof input.legalAcceptedAt === "number" && Number.isFinite(input.legalAcceptedAt)) {
    versions = { terms: LEGAL_VERSIONS.terms, privacy: LEGAL_VERSIONS.privacy };
    consentedAt = new Date(input.legalAcceptedAt);
    evidence = "legal_accepted_at";
  } else {
    const metadata = (input.unsafeMetadata ?? {}) as { legalConsent?: unknown };
    const fromStore = parseLegalVersions(metadata.legalConsent);
    if (fromStore && typeof input.createdAt === "number") {
      versions = fromStore;
      consentedAt = new Date(input.createdAt);
      evidence = "unsafe_metadata";
    }
  }
  if (!versions || !consentedAt || !evidence) return { recorded: false, reason: "no_evidence" };

  const { count } = await prismadb.legalConsentRecord.createMany({
    data: [
      {
        clerkUserId: input.clerkUserId.slice(0, 191),
        channel: LegalConsentChannel.REGISTRO,
        termsVersion: versions.terms,
        privacyVersion: versions.privacy,
        consentedAt,
        evidence,
        sourceEventId: input.eventId?.slice(0, 191) ?? null,
      },
    ],
    skipDuplicates: true,
  });
  return count === 1 ? { recorded: true, evidence } : { recorded: false, reason: "duplicate" };
}
