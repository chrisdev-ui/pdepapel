import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";
import { checkIfStoreOwner } from "@/lib/utils";

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; templateId: string } },
) {
  try {
    const { userId } = await auth();
    const body = await req.json();
    const { name, type, message, variables, mediaUrl, isActive } = body;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (!(await checkIfStoreOwner(userId, params.storeId))) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    if (!params.templateId) {
      return new NextResponse("Template ID is required", { status: 400 });
    }

    const template = await prismadb.whatsAppTemplate.update({
      where: {
        id: params.templateId,
        storeId: params.storeId,
      },
      data: {
        name,
        type,
        message,
        variables,
        mediaUrl,
        isActive,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.log("[WHATSAPP_TEMPLATE_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; templateId: string } },
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (!(await checkIfStoreOwner(userId, params.storeId))) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    if (!params.templateId) {
      return new NextResponse("Template ID is required", { status: 400 });
    }

    const template = await prismadb.whatsAppTemplate.delete({
      where: {
        id: params.templateId,
        storeId: params.storeId,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.log("[WHATSAPP_TEMPLATE_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
