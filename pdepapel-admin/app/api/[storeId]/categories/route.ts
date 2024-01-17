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
    const { name, typeId } = body;
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!typeId)
      return NextResponse.json(
        { error: "Type ID is required" },
        { status: 400 },
      );
    const category = await prismadb.category.create({
      data: { name, typeId, storeId: params.storeId },
    });
    return NextResponse.json(category);
  } catch (error) {
    console.log("[CATEGORIES_POST]", error);
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
    const categories = await prismadb.category.findMany({
      where: { storeId: params.storeId },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.log("[CATEGORIES_GET]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
