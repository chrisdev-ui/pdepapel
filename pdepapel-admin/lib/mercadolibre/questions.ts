import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { richTextToPlainText } from "@/lib/rich-text";

import { getMercadoLibreResource, mutateMercadoLibreJson } from "./client";

type MercadoLibreQuestionPayload = {
  id: string;
  externalItemId: string;
  status: string;
  question: string;
  answer: string | null;
  askedAt: Date | null;
  answeredAt: Date | null;
  lastRemoteUpdateAt: Date | null;
  metadata: Prisma.InputJsonValue;
};

function getString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getDate(value: unknown) {
  const text = getString(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseMercadoLibreQuestion(
  payload: Record<string, unknown>,
): MercadoLibreQuestionPayload {
  const id = getString(payload.id);
  const externalItemId = getString(payload.item_id);
  const question = getString(payload.text);
  if (!id || !externalItemId || !question) {
    throw new Error("Mercado Libre devolvió una pregunta inválida");
  }
  const answer = getRecord(payload.answer);

  return {
    id,
    externalItemId,
    status: getString(payload.status)?.toUpperCase() ?? "PENDING",
    question,
    answer: getString(answer?.text),
    askedAt: getDate(payload.date_created),
    answeredAt: getDate(answer?.date_created),
    lastRemoteUpdateAt: getDate(payload.date_last_updated),
    metadata: {
      answerStatus: getString(answer?.status),
      deletedFrom: getString(payload.deleted_from),
    },
  };
}

export async function synchronizeMercadoLibreQuestion(
  connectionId: string,
  payload: Record<string, unknown>,
) {
  const question = parseMercadoLibreQuestion(payload);
  const listing = await prismadb.marketplaceListing.findFirst({
    where: { connectionId, externalItemId: question.externalItemId },
    select: { id: true, productId: true },
  });

  return prismadb.marketplaceQuestion.upsert({
    where: {
      connectionId_externalQuestionId: {
        connectionId,
        externalQuestionId: question.id,
      },
    },
    update: {
      listingId: listing?.id ?? null,
      productId: listing?.productId ?? null,
      externalItemId: question.externalItemId,
      status: question.status,
      question: question.question,
      answer: question.answer,
      askedAt: question.askedAt,
      answeredAt: question.answeredAt,
      lastRemoteUpdateAt: question.lastRemoteUpdateAt,
      metadata: question.metadata,
    },
    create: {
      connectionId,
      listingId: listing?.id ?? null,
      productId: listing?.productId ?? null,
      externalQuestionId: question.id,
      externalItemId: question.externalItemId,
      status: question.status,
      question: question.question,
      answer: question.answer,
      askedAt: question.askedAt,
      answeredAt: question.answeredAt,
      lastRemoteUpdateAt: question.lastRemoteUpdateAt,
      metadata: question.metadata,
    },
  });
}

export async function synchronizeRecentMercadoLibreQuestions(
  connectionId: string,
) {
  const connection = await prismadb.marketplaceConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: { sellerId: true },
  });
  if (!connection.sellerId) {
    throw new Error("La conexión no tiene un vendedor de Mercado Libre");
  }

  const response = await getMercadoLibreResource(
    connectionId,
    `/questions/search?seller_id=${encodeURIComponent(connection.sellerId)}&api_version=4&limit=50`,
  );
  const questions = Array.isArray(response.questions) ? response.questions : [];
  const synced = await Promise.all(
    questions.flatMap((question) => {
      const record = getRecord(question);
      return record
        ? [synchronizeMercadoLibreQuestion(connectionId, record)]
        : [];
    }),
  );
  return synced.length;
}

export async function answerMercadoLibreQuestion({
  connectionId,
  externalQuestionId,
  text,
}: {
  connectionId: string;
  externalQuestionId: string;
  text: string;
}) {
  const answer = text.trim();
  if (!answer || answer.length > 2000) {
    throw new Error("La respuesta debe tener entre 1 y 2000 caracteres");
  }
  const questionId = Number(externalQuestionId);
  if (!Number.isSafeInteger(questionId) || questionId <= 0) {
    throw new Error(
      "La pregunta de Mercado Libre no tiene un identificador válido",
    );
  }
  await mutateMercadoLibreJson(connectionId, "/answers", {
    method: "POST",
    body: { question_id: questionId, text: answer },
  });
  const payload = await getMercadoLibreResource(
    connectionId,
    `/questions/${encodeURIComponent(externalQuestionId)}`,
  );
  return synchronizeMercadoLibreQuestion(connectionId, payload);
}

function truncate(value: string, length: number) {
  return value.length <= length
    ? value
    : `${value.slice(0, length - 1).trim()}…`;
}

export function createMercadoLibreQuestionSuggestion({
  question,
  product,
}: {
  question: string;
  product: { name: string; description: string } | null;
}) {
  const normalizedQuestion = question.toLocaleLowerCase("es-CO");
  const productName = product?.name ?? "el producto";
  const description = product
    ? truncate(
        richTextToPlainText(product.description).replace(/\s+/g, " ").trim(),
        340,
      )
    : "";

  if (/disponible|stock|todav[ií]a/.test(normalizedQuestion)) {
    return `¡Hola! Sí, ${productName} se encuentra disponible mientras la publicación permita comprarlo. Puedes hacer tu compra con tranquilidad.`;
  }
  if (/medida|tamañ|dimensi/.test(normalizedQuestion)) {
    return `¡Hola! Te compartimos la información disponible de ${productName}: ${description || "puedes revisar las fotos y características de la publicación."}`;
  }
  if (/color|diseñ|modelo/.test(normalizedQuestion)) {
    return `¡Hola! ${productName} se vende según las opciones y fotos visibles en la publicación. Si buscas un color o diseño puntual, indícanos cuál para orientarte.`;
  }
  return `¡Hola! Gracias por preguntar por ${productName}. ${description || "Revisamos tu consulta y te ayudamos con gusto."}`;
}
