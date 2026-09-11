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
import { NextRequest, NextResponse } from "next/server";

/** Campos públicos: la tienda ordena por `createdAt`. */
const PUBLIC_POST_SELECT = {
  id: true,
  social: true,
  postId: true,
  createdAt: true,
} as const;

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

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
        storeId: params.storeId,
        postId,
        social,
      },
      select: { id: true },
    });

    if (existingPost) {
      throw ErrorFactory.Conflict(
        "Ya existe una publicación con este identificador para esta red social",
      );
    }

    const post = await prismadb.post.create({
      data: { social, postId, storeId: params.storeId },
      select: PUBLIC_POST_SELECT,
    });

    await triggerStorefrontRevalidation({
      paths: [...POSTS_REVALIDATION.paths],
      tags: [...POSTS_REVALIDATION.tags],
    });

    return NextResponse.json(post, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "POSTS_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const socialParam = req.nextUrl.searchParams.get("social");
    if (socialParam !== null && !isSocial(socialParam)) {
      throw ErrorFactory.InvalidRequest("La red social es inválida");
    }

    const posts = await prismadb.post.findMany({
      where: {
        storeId: params.storeId,
        ...(socialParam && { social: socialParam }),
      },
      select: PUBLIC_POST_SELECT,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(posts, {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "POSTS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
