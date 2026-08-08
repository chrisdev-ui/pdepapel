import { auth } from "@clerk/nextjs";
import { MarketplaceConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { answerMercadoLibreQuestion } from "@/lib/mercadolibre/questions";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function POST(
  request: Request,
  { params }: { params: { storeId: string; questionId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = (await request.json()) as { text?: unknown };
    if (typeof body.text !== "string") {
      throw ErrorFactory.InvalidRequest(
        "Escribe una respuesta antes de enviarla",
      );
    }

    const question = await prismadb.marketplaceQuestion.findFirst({
      where: {
        id: params.questionId,
        connection: { storeId: params.storeId },
      },
      select: {
        externalQuestionId: true,
        connection: { select: { id: true, status: true } },
      },
    });
    if (!question) throw ErrorFactory.NotFound("Pregunta no encontrada");
    if (question.connection.status !== MarketplaceConnectionStatus.CONNECTED) {
      throw ErrorFactory.InvalidRequest(
        "Reconecta Mercado Libre antes de responder",
      );
    }

    const updated = await answerMercadoLibreQuestion({
      connectionId: question.connection.id,
      externalQuestionId: question.externalQuestionId,
      text: body.text,
    });
    return NextResponse.json(updated, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_QUESTION_ANSWER_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
