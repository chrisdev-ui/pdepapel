import { Prisma, PrismaClient, ReviewStatus } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";

/**
 * Moderación y respuesta de reseñas (rediseño del panel, 2026-09).
 *
 * La tienda publica cada reseña al instante; el panel puede ocultarla sin
 * borrarla (`HIDDEN`) o publicar una respuesta de la tienda. Nada de esto
 * cambia la calificación ni el comentario del cliente. `PENDING` queda
 * reservado en el enum para una aprobación previa que hoy no se usa.
 */

export const REVIEW_ACTIONS = ["hide", "publish", "reply", "clearReply"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const REVIEW_REPLY_MAX_LENGTH = 1000;
export const REVIEW_NOTE_MAX_LENGTH = 300;

export interface ReviewModerationInput {
  action: ReviewAction;
  /** Respuesta pública; obligatoria para `reply`. */
  reply?: string;
  /** Motivo interno de ocultar; nunca se expone en la tienda. */
  note?: string;
}

/** Lo que la tienda puede ver de una reseña; excluye la nota de moderación. */
export const PUBLIC_REVIEW_SELECT = {
  id: true,
  productId: true,
  userId: true,
  name: true,
  rating: true,
  comment: true,
  reply: true,
  repliedAt: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

export const PUBLIC_REVIEW_WHERE = {
  status: ReviewStatus.PUBLISHED,
} satisfies Prisma.ReviewWhereInput;

/** Include listo para `product.findMany({ include: { reviews: PUBLIC_REVIEW_INCLUDE } })`. */
export const PUBLIC_REVIEW_INCLUDE = {
  where: PUBLIC_REVIEW_WHERE,
  orderBy: { createdAt: "desc" },
  select: PUBLIC_REVIEW_SELECT,
} satisfies Prisma.Product$reviewsArgs;

const isAction = (value: unknown): value is ReviewAction =>
  typeof value === "string" && (REVIEW_ACTIONS as readonly string[]).includes(value);

/** Valida el cuerpo del PATCH del panel. Lanza errores 400 legibles. */
export function parseReviewModerationBody(body: unknown): ReviewModerationInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!isAction(raw.action)) {
    throw ErrorFactory.InvalidRequest(
      "La acción debe ser ocultar, publicar, responder o quitar la respuesta",
    );
  }

  const reply = typeof raw.reply === "string" ? raw.reply.trim() : "";
  const note = typeof raw.note === "string" ? raw.note.trim() : "";

  if (raw.action === "reply") {
    if (!reply) throw ErrorFactory.InvalidRequest("Escribe la respuesta antes de publicarla");
    if (reply.length > REVIEW_REPLY_MAX_LENGTH) {
      throw ErrorFactory.InvalidRequest(
        `La respuesta no puede superar ${REVIEW_REPLY_MAX_LENGTH} caracteres`,
      );
    }
  }
  if (note.length > REVIEW_NOTE_MAX_LENGTH) {
    throw ErrorFactory.InvalidRequest(
      `El motivo interno no puede superar ${REVIEW_NOTE_MAX_LENGTH} caracteres`,
    );
  }

  return {
    action: raw.action,
    reply: raw.action === "reply" ? reply : undefined,
    note: raw.action === "hide" && note ? note : undefined,
  };
}

/** Traduce una acción a los campos que cambian en `Review`. Pura. */
export function reviewModerationData(
  input: ReviewModerationInput,
  actor: { userId: string; now?: Date },
): Prisma.ReviewUpdateInput {
  const now = actor.now ?? new Date();
  switch (input.action) {
    case "hide":
      return {
        status: ReviewStatus.HIDDEN,
        moderatedAt: now,
        moderatedBy: actor.userId,
        moderationNote: input.note ?? null,
      };
    case "publish":
      return {
        status: ReviewStatus.PUBLISHED,
        moderatedAt: now,
        moderatedBy: actor.userId,
        moderationNote: null,
      };
    case "reply":
      return { reply: input.reply ?? null, repliedAt: now, repliedBy: actor.userId };
    case "clearReply":
      return { reply: null, repliedAt: null, repliedBy: null };
  }
}

export const REVIEW_ACTION_LABELS: Record<ReviewAction, string> = {
  hide: "Reseña oculta",
  publish: "Reseña publicada",
  reply: "Respuesta publicada",
  clearReply: "Respuesta retirada",
};

type ModerationClient = PrismaClient | Prisma.TransactionClient;

/**
 * Aplica una acción sobre una reseña de la tienda. Quien llama ya verificó
 * que `userId` es dueño de la tienda. Devuelve la reseña con la URL del
 * producto para revalidar la ficha en la tienda en línea.
 */
export async function moderateReview(
  db: ModerationClient,
  params: { storeId: string; reviewId: string; userId: string; input: ReviewModerationInput; now?: Date },
) {
  const review = await db.review.findFirst({
    where: { id: params.reviewId, storeId: params.storeId },
    select: { id: true },
  });
  if (!review) throw ErrorFactory.NotFound("Reseña no encontrada en esta tienda");

  return db.review.update({
    where: { id: review.id },
    data: reviewModerationData(params.input, { userId: params.userId, now: params.now }),
    select: {
      id: true,
      productId: true,
      status: true,
      reply: true,
      repliedAt: true,
      moderatedAt: true,
      moderationNote: true,
      product: { select: { slug: true } },
    },
  });
}

/** Rutas de la tienda que cambian cuando se modera una reseña. */
export function reviewRevalidationPaths(productSlug: string | null | undefined): string[] {
  return productSlug ? [`/producto/${productSlug}`] : [];
}
