import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { DianStatus } from "@prisma/client";

/**
 * Public webhook endpoint for the DIAN Electronic Invoicing Provider
 * E.g., Alegra, Siigo, FacturaScripts will POST to here once DIAN processes the XML
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Standard expected payload shape (would vary per provider in reality)
    const { providerRef, status, cufe, xmlPath, pdfPath, error } = body;

    if (!providerRef || !status) {
      return new NextResponse("Invalid payload", { status: 400 });
    }

    console.log(`[DIAN_WEBHOOK] Received update for ${providerRef}: ${status}`);

    const invoice = await prismadb.invoice.findFirst({
      where: { providerRef },
    });

    if (!invoice) {
      console.warn(
        `[DIAN_WEBHOOK] No invoice found with providerRef ${providerRef}`,
      );
      return new NextResponse("OK", { status: 200 }); // Return 200 so provider stops retrying
    }

    // Map provider status to internal DianStatus enum
    let updatedStatus: DianStatus = DianStatus.PENDING;
    if (status === "ACCEPTED" || status === "APPROVED") {
      updatedStatus = DianStatus.ACCEPTED;
    } else if (status === "REJECTED" || status === "FAILED") {
      updatedStatus = DianStatus.REJECTED;
    }

    await prismadb.invoice.update({
      where: { id: invoice.id },
      data: {
        dianStatus: updatedStatus,
        cufe: cufe || invoice.cufe,
        xmlPath: xmlPath || invoice.xmlPath,
        pdfPath: pdfPath || invoice.pdfPath,
        // Optional: Save error logs if present
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DIAN_WEBHOOK_ERROR]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
