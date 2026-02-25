import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { SimuladoProvider } from "@/lib/invoicing/providers/simulado";
import { InvoiceStatus, DianStatus } from "@prisma/client";

const provider = new SimuladoProvider();

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    const invoices = await prismadb.invoice.findMany({
      where: {
        storeId: params.storeId,
      },
      include: {
        order: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(invoices);
  } catch (error) {
    console.error("[INVOICES_GET]", error);
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

    const { orderId } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    if (!orderId) {
      return new NextResponse("Order ID is required", { status: 400 });
    }

    // Verify ownership
    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // 1. Find Order
    const order = await prismadb.order.findUnique({
      where: { id: orderId, storeId: params.storeId },
      include: {
        orderItems: {
          include: { product: true },
        },
      },
    });

    if (!order) {
      return new NextResponse("Order not found", { status: 404 });
    }

    // 2. Prevent duplicate invoicing
    const existingInvoice = await prismadb.invoice.findFirst({
      where: { orderId },
    });

    if (existingInvoice && existingInvoice.dianStatus === "ACCEPTED") {
      return new NextResponse("Order is already invoiced and accepted", {
        status: 400,
      });
    }

    // 3. Prepare payload for the Provider
    const items = order.orderItems.map((item) => ({
      description: item.product?.name || "Producto General",
      quantity: item.quantity,
      unitPrice: item.price,
      // Default tax to 19% if we don't have it explicitly stored per item
      taxRate: 19.0,
    }));

    // Generate consecutive local invoice number (simplified for testing)
    const count = await prismadb.invoice.count({
      where: { storeId: params.storeId },
    });
    const localInvoiceNumber = `SETT-${1000 + count}`;

    // Create the PENDING invoice record first
    let invoice =
      existingInvoice ||
      (await prismadb.invoice.create({
        data: {
          storeId: params.storeId,
          orderId: order.id,
          invoiceNumber: localInvoiceNumber,
          invoiceStatus: InvoiceStatus.GENERATED,
          dianStatus: DianStatus.PENDING,
          totalAmount: order.total || 0,
          taxAmount: 0, // Should calculate from items
          customerName: order.fullName || "Consumidor Final",
          customerDocId: order.daneCode || null, // Best approximation if CC not separated
          customerEmail: order.email || "noreply@pdepapel.com",
        },
      }));

    // 4. Issue to the Provider
    const response = await provider.issueInvoice({
      orderId: order.id,
      storeId: params.storeId,
      customerName: invoice.customerName,
      customerDocId: invoice.customerDocId || undefined,
      customerEmail: invoice.customerEmail || undefined,
      totalAmount: invoice.totalAmount,
      taxAmount: invoice.taxAmount,
      items,
    });

    if (!response.success) {
      // Update as rejected
      invoice = await prismadb.invoice.update({
        where: { id: invoice.id },
        data: {
          dianStatus: DianStatus.REJECTED,
        },
      });
      return NextResponse.json(
        { success: false, error: response.errorMessage },
        { status: 400 },
      );
    }

    // 5. Success! Update invoice record with DIAN data
    invoice = await prismadb.invoice.update({
      where: { id: invoice.id },
      data: {
        dianStatus: DianStatus.ACCEPTED, // Usually providers return PENDING until DIAN validates. Our simulator returns ACCEPTED instantly if succesful.
        cufe: response.cufe,
        providerRef: response.providerRef,
        xmlPayload: response.xmlPayload,
        xmlPath: response.xmlPath,
        pdfPath: response.pdfPath,
        sentToDianAt: new Date(),
      },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("[INVOICES_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
