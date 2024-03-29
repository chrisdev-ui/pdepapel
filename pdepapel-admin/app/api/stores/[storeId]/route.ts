import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();
    const { name } = body;
    if (!userId)
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!params.storeId)
      return NextResponse.json(
        { error: "Store ID is required" },
        { status: 400 },
      );
    const store = await prismadb.store.updateMany({
      where: { id: params.storeId, userId },
      data: {
        name,
      },
    });
    return NextResponse.json(store);
  } catch (error) {
    console.log("[STORE_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId)
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    if (!params.storeId)
      return NextResponse.json(
        { error: "Store ID is required" },
        { status: 400 },
      );
    const store = await prismadb.store.deleteMany({
      where: { id: params.storeId, userId },
    });
    return NextResponse.json(store);
  } catch (error) {
    console.log("[STORE_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
