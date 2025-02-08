import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { parseErrorDetails } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    const body = await req.json();
    const { name } = body;

    if (!name?.trim()) {
      throw ErrorFactory.InvalidRequest("El nombre de la tienda es requerido");
    }

    const existingStore = await prismadb.store.findFirst({
      where: {
        userId,
        name: name.trim(),
      },
    });

    if (existingStore) {
      throw ErrorFactory.Conflict("Ya tienes una tienda con este nombre");
    }

    const store = await prismadb.store.create({
      data: { name: name.trim(), userId },
    });

    return NextResponse.json(store);
  } catch (error) {
    return handleErrorResponse(error, "STORES_POST");
  }
}

export async function GET(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    const stores = await prismadb.store.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (stores.length === 0) {
      throw ErrorFactory.NotFound("No tienes tiendas registradas");
    }

    return NextResponse.json(stores);
  } catch (error) {
    return handleErrorResponse(error, "STORES_GET");
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Los IDs de las tiendas son requeridos y deben ser un arreglo",
      );
    }

    const stores = await prismadb.store.findMany({
      where: {
        id: {
          in: ids,
        },
        userId,
      },
      include: {
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
    });

    if (stores.length !== ids.length) {
      throw ErrorFactory.InvalidRequest(
        "Algunas tiendas no existen o no te pertenecen",
      );
    }

    // Check for active orders or products
    const storesWithActiveContent = stores.filter(
      (store) => store._count.products > 0 || store._count.orders > 0,
    );

    if (storesWithActiveContent.length > 0) {
      throw ErrorFactory.Conflict(
        "No se pueden eliminar tiendas con productos u órdenes activas",
        {
          ...parseErrorDetails(
            "storesWithActiveContent",
            storesWithActiveContent.map((store) => ({
              id: store.id,
              name: store.name,
              productsCount: store._count.products,
              ordersCount: store._count.orders,
            })),
          ),
        },
      );
    }

    const result = await prismadb.$transaction(async (tx) => {
      for (const id of ids) {
        await tx.store.delete({
          where: {
            id,
            userId,
          },
        });
      }

      return ids.length;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleErrorResponse(error, "STORES_DELETE");
  }
}
