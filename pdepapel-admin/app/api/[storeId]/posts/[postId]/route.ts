import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { Social } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; postId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.postId) {
      throw ErrorFactory.InvalidRequest("El ID de la publicación es requerido");
    }

    const post = await prismadb.post.findUnique({
      where: { id: params.postId, storeId: params.storeId },
    });

    return NextResponse.json(post);
  } catch (error) {
    return handleErrorResponse(error, "POST_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; postId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.postId) {
      throw ErrorFactory.InvalidRequest("El ID de la publicación es requerido");
    }

    const body = await req.json();
    const { social, postId } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!social || !Object.values(Social).includes(social)) {
      throw ErrorFactory.InvalidRequest("La red social es inválida");
    }
    if (!postId) {
      throw ErrorFactory.InvalidRequest("El ID de la publicación es requerido");
    }

    const existingPost = await prismadb.post.findUnique({
      where: {
        id: params.postId,
        storeId: params.storeId,
      },
    });

    if (!existingPost) {
      throw ErrorFactory.NotFound("Publicación no encontrada");
    }

    const duplicatePost = await prismadb.post.findFirst({
      where: {
        storeId: params.storeId,
        social,
        postId,
        NOT: {
          id: params.postId,
        },
      },
    });

    if (duplicatePost) {
      throw ErrorFactory.Conflict(
        "Ya existe una publicación con este ID para esta red social",
      );
    }

    const updatedPost = await prismadb.post.update({
      where: {
        id: params.postId,
      },
      data: {
        social,
        postId,
      },
    });

    return NextResponse.json(updatedPost);
  } catch (error) {
    return handleErrorResponse(error, "POST_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; postId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.postId) {
      throw ErrorFactory.InvalidRequest("El ID de la publicación es requerido");
    }

    await verifyStoreOwner(userId, params.storeId);

    const post = await prismadb.post.findUnique({
      where: {
        id: params.postId,
        storeId: params.storeId,
      },
    });

    if (!post) {
      throw ErrorFactory.NotFound("Publicación no encontrada");
    }

    const deletedPost = await prismadb.post.delete({
      where: {
        id: params.postId,
      },
    });

    return NextResponse.json(deletedPost);
  } catch (error) {
    return handleErrorResponse(error, "POST_DELETE");
  }
}
