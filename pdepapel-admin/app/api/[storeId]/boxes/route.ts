import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { boxInputSchema, normalizeBoxName } from "@/lib/boxes";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json().catch(() => null);
    const parsed = boxInputSchema.safeParse(body);
    if (!parsed.success) {
      throw ErrorFactory.InvalidRequest(
        parsed.error.issues[0]?.message ?? "Revisa los datos de la caja",
        { fieldErrors: parsed.error.flatten().fieldErrors },
      );
    }
    const { name, type, width, height, length, isDefault } = parsed.data;

    // Un nombre por tienda, sin distinguir mayúsculas.
    const siblings = await prismadb.box.findMany({
      where: { storeId: params.storeId },
      select: { id: true, name: true },
    });
    const wanted = normalizeBoxName(name);
    if (siblings.some((box) => normalizeBoxName(box.name) === wanted)) {
      throw ErrorFactory.Conflict(
        `Ya existe una caja llamada «${name}» en esta tienda. Usa otro nombre.`,
      );
    }

    // Solo una caja predeterminada por tipo y tienda: quitar la anterior y
    // crear la nueva en la misma transacción.
    const box = await prismadb.$transaction(async (tx) => {
      if (isDefault) {
        await tx.box.updateMany({
          where: { storeId: params.storeId, type, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.box.create({
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
    // Medidas de empaque internas: solo el panel, sin caché compartida.
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const boxes = await prismadb.box.findMany({
      where: {
        storeId: params.storeId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(boxes, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOXES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
