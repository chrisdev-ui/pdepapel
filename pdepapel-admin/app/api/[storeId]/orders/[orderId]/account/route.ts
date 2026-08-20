import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { CACHE_HEADERS } from "@/lib/utils";
import { createCorsHeaders } from "@/lib/cors";
import {
  createOrderAccountClaimToken,
  hasMatchingOrderAccountEmail,
  hashOrderAccountClaimToken,
} from "@/lib/order-account-claims";
import prismadb from "@/lib/prismadb";
import { auth, clerkClient } from "@clerk/nextjs";
import { OrderAccountClaimSource, OrderType } from "@prisma/client";
import { NextResponse } from "next/server";

const getCorsHeaders = (request: Request) =>
  createCorsHeaders(request, { methods: "POST, PATCH, OPTIONS" });

const isGuestOrder = (userId: string | null) => !userId;

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  const corsHeaders = getCorsHeaders(req);

  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.orderId) {
      throw ErrorFactory.InvalidRequest("Se requiere el ID del pedido");
    }

    const { guestId } = await req.json();
    if (typeof guestId !== "string" || guestId.length < 16) {
      throw ErrorFactory.Unauthorized();
    }

    const order = await prismadb.order.findFirst({
      where: {
        id: params.orderId,
        storeId: params.storeId,
        type: OrderType.STANDARD,
        guestId,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!order || !isGuestOrder(order.userId)) {
      throw ErrorFactory.Unauthorized();
    }

    const { token, tokenHash, expiresAt } = createOrderAccountClaimToken();

    await prismadb.orderAccountClaim.upsert({
      where: {
        orderId_source: {
          orderId: order.id,
          source: OrderAccountClaimSource.DEVICE,
        },
      },
      update: {
        storeId: params.storeId,
        tokenHash,
        expiresAt,
        claimedAt: null,
      },
      create: {
        storeId: params.storeId,
        orderId: order.id,
        source: OrderAccountClaimSource.DEVICE,
        tokenHash,
        expiresAt,
      },
    });

    return NextResponse.json(
      { token, expiresAt: expiresAt.toISOString() },
      { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } },
    );
  } catch (error) {
    return handleErrorResponse(error, "ORDER_ACCOUNT_CLAIM_PREPARE", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  const corsHeaders = getCorsHeaders(req);

  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.orderId) {
      throw ErrorFactory.InvalidRequest("Se requiere el ID del pedido");
    }

    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    const { token } = await req.json();
    if (typeof token !== "string" || token.length < 32) {
      throw ErrorFactory.InvalidRequest("El enlace para guardar el pedido no es válido");
    }

    const now = new Date();
    const tokenHash = hashOrderAccountClaimToken(token);
    const [order, claim, user] = await Promise.all([
      prismadb.order.findFirst({
        where: {
          id: params.orderId,
          storeId: params.storeId,
          type: OrderType.STANDARD,
        },
        select: {
          id: true,
          email: true,
          userId: true,
        },
      }),
      prismadb.orderAccountClaim.findFirst({
        where: {
          orderId: params.orderId,
          storeId: params.storeId,
          tokenHash,
          claimedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      }),
      clerkClient.users.getUser(userId),
    ]);

    const primaryEmailAddress = user.emailAddresses?.find(
      (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
    );
    const verifiedEmail =
      primaryEmailAddress?.verification?.status === "verified"
        ? primaryEmailAddress.emailAddress
        : null;

    if (
      !order ||
      !claim ||
      !isGuestOrder(order.userId) ||
      !hasMatchingOrderAccountEmail(order.email, verifiedEmail)
    ) {
      throw ErrorFactory.Unauthorized();
    }

    const result = await prismadb.$transaction(async (tx) => {
      const claimedOrder = await tx.order.updateMany({
        where: {
          id: order.id,
          storeId: params.storeId,
          OR: [{ userId: null }, { userId: "" }],
        },
        data: {
          userId,
          guestId: null,
        },
      });

      if (claimedOrder.count !== 1) {
        throw ErrorFactory.Conflict(
          "Este pedido ya está guardado en una cuenta",
        );
      }

      const claimedToken = await tx.orderAccountClaim.updateMany({
        where: {
          id: claim.id,
          tokenHash,
          claimedAt: null,
          expiresAt: { gt: now },
        },
        data: { claimedAt: now },
      });

      if (claimedToken.count !== 1) {
        throw ErrorFactory.Conflict(
          "El enlace para guardar el pedido ya fue utilizado o venció",
        );
      }

      return claimedOrder;
    });

    return NextResponse.json(
      { claimed: result.count === 1 },
      { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } },
    );
  } catch (error) {
    return handleErrorResponse(error, "ORDER_ACCOUNT_CLAIM", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
