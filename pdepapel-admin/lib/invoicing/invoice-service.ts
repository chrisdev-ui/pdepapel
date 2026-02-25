import prismadb from "@/lib/prismadb";
import { DianStatus, InvoiceStatus } from "@prisma/client";
import { InvoiceProvider, InvoiceRequest } from "./types";
import { StubProvider } from "./providers/stub-provider";

export class InvoiceService {
  private provider: InvoiceProvider;

  constructor(provider?: InvoiceProvider) {
    // Allows dependency injection for tests, falling back to StubProvider or a real one later
    this.provider = provider || new StubProvider();
  }

  async createInvoiceForOrder(orderId: string, storeId: string) {
    // 1. Fetch order details from DB to build the InvoiceRequest
    const order = await prismadb.order.findUnique({
      where: { id: orderId, storeId },
      include: {
        orderItems: { include: { product: true } },
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Check if an invoice already exists
    let invoice = await prismadb.invoice.findFirst({
      where: { orderId },
    });

    if (invoice && invoice.dianStatus === DianStatus.ACCEPTED) {
      return invoice;
    }

    // 2. Map DB Order to InvoiceRequest
    const request: InvoiceRequest = {
      orderId: order.id,
      storeId: order.storeId,
      customerName: order.fullName,
      customerDocId: order.documentId || "222222222222", // Default "Consumidor Final" doc
      customerEmail: order.email || "consumidorfinal@example.com",
      totalAmount: order.total,
      taxAmount: 0, // Calculate properly based on product tax rates in local logic
      items: order.orderItems.map((item) => ({
        description: item.product?.name || item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        taxRate: 0, // Extend schema or logic to pull real tax if needed
      })),
    };

    // 3. Create Draft Invoice record in DB
    if (invoice) {
      invoice = await prismadb.invoice.update({
        where: { id: invoice.id },
        data: {
          invoiceStatus: InvoiceStatus.GENERATED,
          dianStatus: DianStatus.PENDING,
        },
      });
    } else {
      invoice = await prismadb.invoice.create({
        data: {
          orderId: order.id,
          storeId: order.storeId,
          invoiceNumber: "INV-" + order.orderNumber,
          invoiceStatus: InvoiceStatus.GENERATED,
          dianStatus: DianStatus.PENDING,
          totalAmount: order.total,
          taxAmount: 0,
          customerName: order.fullName,
          customerDocId: order.documentId,
          customerEmail: order.email,
        },
      });
    }

    // 4. Delegate to the provider (Stub or Real)
    try {
      const response = await this.provider.issueInvoice(request);

      if (response.success) {
        return await prismadb.invoice.update({
          where: { id: invoice.id },
          data: {
            providerRef: response.providerRef,
            cufe: response.cufe,
            xmlPath: response.xmlPath,
            pdfPath: response.pdfPath,
            dianStatus: DianStatus.ACCEPTED,
            invoiceStatus: InvoiceStatus.SENT,
          },
        });
      } else {
        return await prismadb.invoice.update({
          where: { id: invoice.id },
          data: {
            dianStatus: DianStatus.REJECTED,
          },
        });
      }
    } catch (error: any) {
      console.error("[INVOICE_SERVICE_ERROR]", error);
      return await prismadb.invoice.update({
        where: { id: invoice.id },
        data: {
          dianStatus: DianStatus.ERROR,
        },
      });
    }
  }

  async checkStatus(orderId: string) {
    const invoice = await prismadb.invoice.findFirst({
      where: { orderId },
    });
    if (!invoice || !invoice.providerRef) return null;

    const response = await this.provider.checkStatus(invoice.providerRef);

    // Convert string status to Enum
    const dianStatusMap: Record<string, DianStatus> = {
      PENDING: DianStatus.PENDING,
      ACCEPTED: DianStatus.ACCEPTED,
      REJECTED: DianStatus.REJECTED,
    };

    return await prismadb.invoice.update({
      where: { id: invoice.id },
      data: {
        dianStatus: dianStatusMap[response.status] || DianStatus.PENDING,
        cufe: response.cufe || invoice.cufe,
        xmlPath: response.xmlPath || invoice.xmlPath,
        pdfPath: response.pdfPath || invoice.pdfPath,
      },
    });
  }
}
