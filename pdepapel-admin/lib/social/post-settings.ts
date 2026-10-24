import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { SocialPostNotFound } from "./post-tags";

type Db = Pick<PrismaClient, "socialPost">;

/** null = sin decidir otra vez (vuelve a aparecer la sugerencia si aplica). */
export const promotionInputSchema = z.object({ promotion: z.enum(["PROMOTED", "NOT_PROMOTED"]).nullable() }).strict();

export const DURATION_MANUAL_MAX_SEC = 3600;
export const durationInputSchema = z
  .object({
    seconds: z
      .number({ invalid_type_error: "La duración debe ser un número de segundos" })
      .finite()
      .min(1, "La duración debe ser de al menos 1 segundo")
      .max(DURATION_MANUAL_MAX_SEC, "La duración no puede pasar de una hora")
      .nullable(),
  })
  .strict();

async function ownPost(db: Db, storeId: string, postId: string) {
  const post = await db.socialPost.findFirst({ where: { id: postId, account: { storeId } }, select: { id: true } });
  if (!post) throw new SocialPostNotFound();
  return post;
}

/** La decisión de la dueña: siempre gana y la sincronización no la toca. */
export async function setSocialPostPromotion(db: Db, storeId: string, postId: string, input: z.infer<typeof promotionInputSchema>, now = new Date()) {
  await ownPost(db, storeId, postId);
  return db.socialPost.update({
    where: { id: postId },
    data: input.promotion === null ? { promotion: null, promotionSource: null, promotionSetAt: null } : { promotion: input.promotion, promotionSource: "MANUAL", promotionSetAt: now },
    select: { promotion: true, promotionSource: true },
  });
}

/** Duración escrita a mano (null la borra). La leída del video, si llega, gana al mostrarla. */
export async function setSocialPostManualDuration(db: Db, storeId: string, postId: string, input: z.infer<typeof durationInputSchema>) {
  await ownPost(db, storeId, postId);
  return db.socialPost.update({ where: { id: postId }, data: { durationManualSec: input.seconds }, select: { durationManualSec: true } });
}
