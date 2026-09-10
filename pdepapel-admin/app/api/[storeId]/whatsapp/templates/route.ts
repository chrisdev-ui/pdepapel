import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";
import { checkIfStoreOwner } from "@/lib/utils";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (!(await checkIfStoreOwner(userId, params.storeId))) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const isActive = searchParams.get("isActive");

    const where: any = {
      storeId: params.storeId,
    };

    if (type) where.type = type;
    if (isActive) where.isActive = isActive === "true";

    const templates = await prismadb.whatsAppTemplate.findMany({
      where,
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.log("[WHATSAPP_TEMPLATES_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    const body = await req.json();

    const { name, type, message, variables, mediaUrl } = body;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (!(await checkIfStoreOwner(userId, params.storeId))) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    if (!name || !message) {
      return new NextResponse("Name and message are required", { status: 400 });
    }

    const template = await prismadb.whatsAppTemplate.create({
      data: {
        storeId: params.storeId,
        name,
        type: type || "CUSTOM",
        message,
        variables,
        mediaUrl,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.log("[WHATSAPP_TEMPLATES_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
