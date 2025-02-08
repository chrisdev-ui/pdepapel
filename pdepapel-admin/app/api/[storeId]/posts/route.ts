import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { Social } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const body = await req.json();
    const { social, postId } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!social || !Object.values(Social).includes(social)) {
      throw ErrorFactory.InvalidRequest("La red social es inválida");
    }
    if (!postId) {
      throw ErrorFactory.InvalidRequest("El ID de la publicación es requerido");
    }

    // Check if post already exists
    const existingPost = await prismadb.post.findFirst({
      where: {
        storeId: params.storeId,
        postId,
        social,
      },
    });

    if (existingPost) {
      throw ErrorFactory.Conflict(
        "Ya existe una publicación con este ID para esta red social",
      );
    }

    const post = await prismadb.post.create({
      data: { social, postId, storeId: params.storeId },
    });

    return NextResponse.json(post);
  } catch (error) {
    return handleErrorResponse(error, "POSTS_POST");
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const social = req.nextUrl.searchParams.get("social") as Social | null;

    const posts = await prismadb.post.findMany({
      where: { storeId: params.storeId, ...(social && { social }) },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(posts);
  } catch (error) {
    return handleErrorResponse(error, "POSTS_GET");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Los IDs de las publicaciones son requeridos y deben estar en un arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
      const posts = await tx.post.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      if (posts.length !== ids.length) {
        throw ErrorFactory.InvalidRequest(
          "Algunas publicaciones no existen o no pertenecen a esta tienda",
        );
      }

      return await tx.post.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleErrorResponse(error, "POSTS_DELETE");
  }
}
