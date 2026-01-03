import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { checkIfStoreOwner } from "@/lib/db-utils";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const { name, type, width, height, length, isDefault } = body;

    if (!userId) {
      throw ErrorFactory.Unauthenticated();
    }

    if (!name) {
      throw ErrorFactory.InvalidRequest("Name is required");
    }

    if (!width || !height || !length) {
      throw ErrorFactory.InvalidRequest("Dimensions are required");
    }

    if (!type) {
      throw ErrorFactory.InvalidRequest("Type is required");
    }

    if (!params.storeId) {
      throw ErrorFactory.MissingStoreId();
    }

    const isStoreOwner = await checkIfStoreOwner(userId, params.storeId);

    if (!isStoreOwner) {
      throw ErrorFactory.Unauthorized();
    }

    // If setting as default, unset other defaults for this type
    if (isDefault) {
      await prismadb.box.updateMany({
        where: {
          storeId: params.storeId,
          type,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const box = await prismadb.box.create({
      data: {
        name,
        type,
        width,
        height,
        length,
        isDefault,
        storeId: params.storeId,
      },
    });

    return NextResponse.json(box, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOXES_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) {
      throw ErrorFactory.MissingStoreId();
    }

    const boxes = await prismadb.box.findMany({
      where: {
        storeId: params.storeId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(boxes, { headers: CACHE_HEADERS.STATIC });
  } catch (error) {
    return handleErrorResponse(error, "BOXES_GET", {
      headers: CACHE_HEADERS.STATIC,
    });
  }
}
