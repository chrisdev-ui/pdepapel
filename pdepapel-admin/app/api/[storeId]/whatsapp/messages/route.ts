import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const customOrderId = searchParams.get("customOrderId");
    const phone = searchParams.get("phone");

    const where: any = {
      storeId: params.storeId,
    };

    if (customOrderId) {
      where.customOrderId = customOrderId;
    }

    if (phone) {
      where.recipientPhone = { contains: phone };
    }

    const messages = await prismadb.whatsAppMessage.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.log("[WHATSAPP_MESSAGES_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const {
      customOrderId,
      recipientPhone,
      recipientName,
      message,
      mediaUrl,
      mediaType,
      templateId,
    } = body;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!recipientPhone || !message) {
      return new NextResponse("Phone and message are required", {
        status: 400,
      });
    }

    const whatsappMessage = await prismadb.whatsAppMessage.create({
      data: {
        storeId: params.storeId,
        customOrderId,
        recipientPhone,
        recipientName,
        message,
        mediaUrl,
        mediaType,
        templateId,
        createdBy: userId,
        status: "SENT", // Assuming manual send for MVP
        sentAt: new Date(),
      },
    });

    // Update usage if template used
    if (templateId) {
      await prismadb.whatsAppTemplate
        .update({
          where: { id: templateId },
          data: { usageCount: { increment: 1 } },
        })
        .catch((err) => console.error("Template update failed", err));
    }

    // Update custom order status
    if (customOrderId) {
      await prismadb.customOrder
        .update({
          where: { id: customOrderId },
          data: { status: "SENT" },
        })
        .catch((err) => console.error("Order update failed", err));
    }

    return NextResponse.json(whatsappMessage);
  } catch (error) {
    console.log("[WHATSAPP_MESSAGES_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
