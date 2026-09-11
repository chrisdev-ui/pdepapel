import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import {
  isSocial,
  isSupportedSocial,
  parseSocialPostId,
  POSTS_REVALIDATION,
  UNSUPPORTED_SOCIAL_MESSAGE,
} from "@/lib/social-posts";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const PUBLIC_POST_SELECT = {
  id: true,
  social: true,
  postId: true,
  createdAt: true,
} as const;

const revalidatePostsOnStorefront = () =>
  triggerStorefrontRevalidation({
    paths: [...POSTS_REVALIDATION.paths],
    tags: [...POSTS_REVALIDATION.tags],
  });

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; postId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.postId) {
      throw ErrorFactory.InvalidRequest("El ID de la publicación es requerido");
    }

    const post = await prismadb.post.findFirst({
      where: { id: params.postId, storeId: params.storeId },
      select: PUBLIC_POST_SELECT,
    });

    if (!post) {
      throw ErrorFactory.NotFound("Publicación no encontrada");
    }

    return NextResponse.json(post, {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "POST_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; postId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.postId) {
      throw ErrorFactory.InvalidRequest("El ID de la publicación es requerido");
    }

    const body = await req.json();
    const { social, postId: rawPostId } = body ?? {};

    await verifyStoreOwner(userId, params.storeId);

    if (!isSocial(social)) {
      throw ErrorFactory.InvalidRequest("La red social es inválida");
    }
    if (!isSupportedSocial(social)) {
      throw ErrorFactory.InvalidRequest(UNSUPPORTED_SOCIAL_MESSAGE);
    }

    const parsed = parseSocialPostId(
      social,
      typeof rawPostId === "string" ? rawPostId : "",
    );
    if (!parsed.ok) {
      throw ErrorFactory.InvalidRequest(parsed.error);
    }
    const postId = parsed.postId;

    const existingPost = await prismadb.post.findFirst({
      where: {
        id: params.postId,
        storeId: params.storeId,
      },
      select: { id: true },
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
      select: { id: true },
    });

    if (duplicatePost) {
      throw ErrorFactory.Conflict(
        "Ya existe una publicación con este identificador para esta red social",
      );
    }

    const updatedPost = await prismadb.post.update({
      where: {
        id: params.postId,
        storeId: params.storeId,
      },
      data: {
        social,
        postId,
      },
      select: PUBLIC_POST_SELECT,
    });

    await revalidatePostsOnStorefront();

    return NextResponse.json(updatedPost, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "POST_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; postId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.postId) {
      throw ErrorFactory.InvalidRequest("El ID de la publicación es requerido");
    }

    await verifyStoreOwner(userId, params.storeId);

    const post = await prismadb.post.findFirst({
      where: {
        id: params.postId,
        storeId: params.storeId,
      },
      select: { id: true },
    });

    if (!post) {
      throw ErrorFactory.NotFound("Publicación no encontrada");
    }

    await prismadb.post.delete({
      where: {
        id: params.postId,
        storeId: params.storeId,
      },
    });

    await revalidatePostsOnStorefront();

    return NextResponse.json("Publicación eliminada", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "POST_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
