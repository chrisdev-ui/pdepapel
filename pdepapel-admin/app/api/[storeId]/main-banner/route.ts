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
    const { title, label1, label2, highlight, callToAction, imageUrl } = body;
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!imageUrl)
      return NextResponse.json(
        { error: "Image URL is required" },
        { status: 400 },
      );
    if (!callToAction) {
      return NextResponse.json(
        { error: "Call to action is required" },
        { status: 400 },
      );
    }

    const mainBanner = await prismadb.mainBanner.create({
      data: {
        title,
        label1,
        label2,
        highlight,
        callToAction,
        imageUrl,
        storeId: params.storeId,
      },
    });
    return NextResponse.json(mainBanner);
  } catch (error) {
    console.log("[MAIN_BANNERS_POST]", error);
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
    const mainBanner = await prismadb.mainBanner.findFirst({
      where: { storeId: params.storeId },
    });
    return NextResponse.json(mainBanner);
  } catch (error) {
    console.log("[MAIN_BANNERS_GET]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
