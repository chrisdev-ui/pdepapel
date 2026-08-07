import { auth } from "@clerk/nextjs";
import { FairEventStatus, OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const fairs = await prismadb.fairEvent.findMany({
      where: { storeId: params.storeId },
      include: {
        inventoryItems: {
          select: {
            allocatedQuantity: true,
            soldQuantity: true,
            returnedQuantity: true,
          },
        },
        orders: {
          where: { status: { in: [OrderStatus.PAID, OrderStatus.SENT] } },
          select: { total: true },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(
      fairs.map((fair) => ({
        ...fair,
        totalAllocated: fair.inventoryItems.reduce(
          (total, item) => total + item.allocatedQuantity,
          0,
        ),
        totalSold: fair.inventoryItems.reduce(
          (total, item) => total + item.soldQuantity,
          0,
        ),
        salesTotal: fair.orders.reduce(
          (total, order) => total + order.total,
          0,
        ),
      })),
      { headers: corsHeaders },
    );
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENTS_GET", {
      headers: corsHeaders,
    });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const location =
      typeof body.location === "string" ? body.location.trim() || null : null;
    const notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;
    const startsAt = body.startsAt ? new Date(body.startsAt) : null;
    const endsAt = body.endsAt ? new Date(body.endsAt) : null;

    if (name.length < 3) {
      throw ErrorFactory.InvalidRequest(
        "El nombre de la feria debe tener al menos 3 caracteres",
      );
    }
    if (startsAt && Number.isNaN(startsAt.getTime())) {
      throw ErrorFactory.InvalidRequest("La fecha de inicio no es válida");
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw ErrorFactory.InvalidRequest("La fecha de cierre no es válida");
    }
    if (startsAt && endsAt && endsAt < startsAt) {
      throw ErrorFactory.InvalidRequest(
        "La fecha de cierre debe ser posterior a la fecha de inicio",
      );
    }

    const fairEvent = await prismadb.fairEvent.create({
      data: {
        storeId: params.storeId,
        name,
        location,
        notes,
        startsAt,
        endsAt,
        status: FairEventStatus.DRAFT,
        createdBy: userId,
      },
    });

    return NextResponse.json(fairEvent, {
      status: 201,
      headers: corsHeaders,
    });
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENTS_POST", {
      headers: corsHeaders,
    });
  }
}
