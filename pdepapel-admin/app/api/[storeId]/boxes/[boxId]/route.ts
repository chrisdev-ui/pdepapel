import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { checkIfStoreOwner } from "@/lib/db-utils";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;

export async function GET(
  req: Request,
  { params }: { params: { boxId: string; storeId: string } },
) {
  try {
    if (!params.boxId) {
      throw ErrorFactory.InvalidRequest("Box id is required");
    }

    const box = await prismadb.box.findUnique({
      where: {
        id: params.boxId,
      },
    });

    return NextResponse.json(box, { headers: CACHE_HEADERS.STATIC });
  } catch (error) {
    return handleErrorResponse(error, "BOX_GET", {
      headers: CACHE_HEADERS.STATIC,
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { boxId: string; storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      throw ErrorFactory.Unauthenticated();
    }

    if (!params.boxId) {
      throw ErrorFactory.InvalidRequest("Box id is required");
    }

    const isStoreOwner = await checkIfStoreOwner(userId, params.storeId);

    if (!isStoreOwner) {
      throw ErrorFactory.Unauthorized();
    }

    const box = await prismadb.box.delete({
      where: {
        id: params.boxId,
      },
    });

    return NextResponse.json(box, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOX_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { boxId: string; storeId: string } },
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

    if (!params.boxId) {
      throw ErrorFactory.InvalidRequest("Box id is required");
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
          NOT: {
            id: params.boxId,
          },
        },
        data: {
          isDefault: false,
        },
      });
    }

    const box = await prismadb.box.update({
      where: {
        id: params.boxId,
      },
      data: {
        name,
        type,
        width,
        height,
        length,
        isDefault,
      },
    });

    return NextResponse.json(box, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOX_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
