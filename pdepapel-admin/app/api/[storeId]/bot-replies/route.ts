import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { parseBotReplyInput } from "@/lib/whatsapp/bot-replies";

/** Respuestas automáticas de WhatsApp: las escribe la dueña, nadie más. */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const input = parseBotReplyInput(await req.json());
    const reply = await prismadb.whatsAppBotReply.create({
      data: { ...input, storeId: params.storeId },
    });

    return NextResponse.json(reply, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_REPLIES_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400],
    });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const replies = await prismadb.whatsAppBotReply.findMany({
      where: { storeId: params.storeId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(replies, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_REPLIES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
