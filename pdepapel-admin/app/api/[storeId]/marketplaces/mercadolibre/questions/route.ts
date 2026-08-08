import { auth } from "@clerk/nextjs";
import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  createMercadoLibreQuestionSuggestion,
  synchronizeRecentMercadoLibreQuestions,
} from "@/lib/mercadolibre/questions";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

async function getConnection(storeId: string) {
  const connection = await prismadb.marketplaceConnection.findUnique({
    where: {
      storeId_provider: { storeId, provider: MarketplaceProvider.MERCADOLIBRE },
    },
    select: { id: true, status: true },
  });
  if (!connection) {
    throw ErrorFactory.NotFound("Primero conecta la cuenta de Mercado Libre");
  }
  if (connection.status !== MarketplaceConnectionStatus.CONNECTED) {
    throw ErrorFactory.InvalidRequest(
      "Reconecta Mercado Libre antes de consultar preguntas",
    );
  }
  return connection;
}

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const connection = await getConnection(params.storeId);

    const questions = await prismadb.marketplaceQuestion.findMany({
      where: { connectionId: connection.id },
      select: {
        id: true,
        externalQuestionId: true,
        status: true,
        question: true,
        answer: true,
        askedAt: true,
        answeredAt: true,
        listingId: true,
        product: { select: { name: true, description: true } },
      },
      orderBy: [{ askedAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    return NextResponse.json(
      questions.map((question) => ({
        ...question,
        suggestedAnswer: createMercadoLibreQuestionSuggestion({
          question: question.question,
          product: question.product,
        }),
      })),
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_QUESTIONS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const connection = await getConnection(params.storeId);
    const count = await synchronizeRecentMercadoLibreQuestions(connection.id);
    return NextResponse.json(
      { message: `${count} preguntas actualizadas` },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_QUESTIONS_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
