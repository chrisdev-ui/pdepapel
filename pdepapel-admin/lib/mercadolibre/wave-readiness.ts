/**
 * Cuándo un producto de una tanda puede publicarse en Mercado Libre. Lo usa el
 * publicador por tandas (B2) antes de crear nada y el informe de cada tanda.
 * Todas las condiciones son obligatorias; ninguna se da por buena sin dato.
 */
import { type LicensedMatch, licensedReason } from "@/lib/mercadolibre/licensed-characters";

export type WaveCategoryStatus = "validada" | "corregida" | "por confirmar";
export type WaveFeeSource = "real" | "estimado" | "pendiente";
export type WavePhotoStatus = "apta" | "revisar" | "necesita foto nueva";

export interface WaveItemFacts {
  /**
   * Categoría comparada con el predictor de Mercado Libre. «corregida» solo se aprueba sola cuando es
   * exactamente el primer resultado del predictor (`categoryMatchesPredictorTop`); si no, queda por confirmar.
   */
  categoryStatus: WaveCategoryStatus | null;
  categoryMatchesPredictorTop: boolean;
  /** Comisión cotizada en esa categoría (`listing_prices`), no la de un tipo de publicación en general. */
  feeSource: WaveFeeSource;
  photoStatus: WavePhotoStatus | null;
  /** Christian aprobó la hoja de contacto de la tanda. */
  contactSheetApproved: boolean;
  /** Regla permanente: las preventas quedan fuera de Mercado Libre. */
  presaleBlocked: boolean;
  /**
   * Personaje con licencia (`findLicensedCharacter`). «excluido» nunca entra en una tanda;
   * «por revisar» entra solo con `licenseApproved` (Christian lo aprobó para ese producto).
   */
  licensed: LicensedMatch | null;
  licenseApproved: boolean;
}

export function waveItemReadiness(facts: WaveItemFacts): { publishable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (facts.presaleBlocked) reasons.push("Está en preventa: las preventas no van a Mercado Libre.");
  if (facts.licensed && (facts.licensed.tier === "excluded" || !facts.licenseApproved)) reasons.push(licensedReason(facts.licensed));
  if (facts.categoryStatus === "corregida") {
    if (!facts.categoryMatchesPredictorTop) {
      reasons.push("La categoría no es la primera del predictor de Mercado Libre: queda por confirmar.");
    }
  } else if (facts.categoryStatus !== "validada") reasons.push("Falta validar la categoría de Mercado Libre.");
  if (facts.feeSource !== "real") reasons.push("Falta cotizar la comisión real en esa categoría.");
  if (facts.photoStatus === "necesita foto nueva") reasons.push("Necesita una foto nueva.");
  else if (facts.photoStatus !== "apta") reasons.push("La portada está por revisar en la hoja de contacto.");
  if (!facts.contactSheetApproved) reasons.push("Falta aprobar la hoja de contacto de la tanda.");
  return { publishable: reasons.length === 0, reasons };
}
