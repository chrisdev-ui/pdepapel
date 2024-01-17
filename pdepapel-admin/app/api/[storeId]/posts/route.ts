import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400 },
    );
  try {
    const body = await req.json();
    const { social, postId } = body;
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!social)
      return NextResponse.json(
        { error: "Social Network is required" },
        { status: 400 },
      );
    if (!postId)
      return NextResponse.json(
        { error: "Post Id is required" },
        { status: 400 },
      );
    const post = await prismadb.post.create({
      data: { social, postId, storeId: params.storeId },
    });
    return NextResponse.json(post);
  } catch (error) {
    console.log("[POSTS_POST]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400 },
    );
  try {
    const posts = await prismadb.post.findMany({
      where: { storeId: params.storeId },
    });
    return NextResponse.json(posts);
  } catch (error) {
    console.log("[POSTS_GET]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
