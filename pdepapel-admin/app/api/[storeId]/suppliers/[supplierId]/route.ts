import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { supplierId: string } },
) {
  if (!params.supplierId)
    return NextResponse.json(
      { error: "Supplier ID is required" },
      { status: 400 },
    );
  try {
    const supplier = await prismadb.supplier.findUnique({
      where: { id: params.supplierId },
    });
    return NextResponse.json(supplier);
  } catch (error) {
    console.log("[SUPPLIER_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; supplierId: string } },
) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!params.supplierId)
    return NextResponse.json(
      { error: "Supplier ID is required" },
      { status: 400 },
    );
  try {
    const body = await req.json();
    const { name } = body;
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const supplier = await prismadb.supplier.update({
      where: { id: params.supplierId },
      data: {
        name,
      },
    });
    return NextResponse.json(supplier);
  } catch (error) {
    console.log("[SUPPLIER_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; supplierId: string } },
) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!params.supplierId)
    return NextResponse.json(
      { error: "Supplier ID is required" },
      { status: 400 },
    );
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const supplier = await prismadb.supplier.delete({
      where: { id: params.supplierId },
    });
    return NextResponse.json(supplier);
  } catch (error) {
    console.log("[SUPPLIER_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
