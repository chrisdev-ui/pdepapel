import { redactLogText } from "@/lib/log-redaction";

/**
 * Una guía de EnvioClick se cobra al crearla. El candado de Redis deja pasar a todos si Redis no
 * responde, así que la autoridad es esta reserva en la fila del envío: una sola sentencia
 * (con relationMode "prisma", updateMany lee y luego escribe, y dos peticiones a la vez pasaban).
 *
 * `guideAttemptedAt` con `guideError` vacío y sin `envioClickIdOrder` = guía en curso. Un intento
 * fallido deja `guideError` y libera la reserva; una reserva abandonada (función cortada) vence a los
 * 5 minutos, por encima de los 60 s que dura como máximo una función del panel.
 */
export const GUIDE_CLAIM_WINDOW_MS = 5 * 60_000;

export const GUIDE_IN_PROGRESS_MESSAGE =
  "Ya se está creando la guía de este pedido. Espera unos segundos y recarga la página.";

type RawExecutor = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
};

export async function claimGuideCreation(db: RawExecutor, shippingId: string, now = new Date()): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - GUIDE_CLAIM_WINDOW_MS);
  const claimed = await db.$executeRaw`UPDATE \`Shipping\` SET \`guideAttemptedAt\` = ${now}, \`guideError\` = NULL WHERE \`id\` = ${shippingId} AND \`envioClickIdOrder\` IS NULL AND (\`guideAttemptedAt\` IS NULL OR \`guideError\` IS NOT NULL OR \`guideAttemptedAt\` < ${staleBefore})`;
  return claimed === 1;
}

export interface ExistingGuide {
  alreadyExisted: true;
  status: "OK";
  data: { idOrder: number; tracker: string | null; url: string | null };
}

export function existingGuide(shipping: { envioClickIdOrder: number | null; trackingCode?: string | null; guideUrl?: string | null }): ExistingGuide {
  return {
    alreadyExisted: true,
    status: "OK",
    data: { idOrder: shipping.envioClickIdOrder as number, tracker: shipping.trackingCode ?? null, url: shipping.guideUrl ?? null },
  };
}

type ShippingWriter = {
  shipping: { update: (args: { where: { id: string }; data: { guideError: string; guideAttemptedAt: Date } }) => Promise<unknown> };
};

/** Un intento fallido libera la reserva y deja el motivo para el panel; no cambia el estado del envío. */
export async function releaseGuideClaim(db: ShippingWriter, shippingId: string, error: unknown): Promise<void> {
  const message = error instanceof Error && error.message ? error.message : "No se pudo crear la guía";
  await db.shipping.update({
    where: { id: shippingId },
    data: { guideError: redactLogText(message, 2_000), guideAttemptedAt: new Date() },
  });
}
