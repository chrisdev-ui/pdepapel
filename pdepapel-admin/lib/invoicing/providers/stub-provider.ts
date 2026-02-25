import { InvoiceProvider, InvoiceRequest, InvoiceResponse } from "../types";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

/**
 * Stub Provider for development and architecture testing.
 * Acts as a mock DIAN connector to avoid consuming real credits.
 */
export class StubProvider implements InvoiceProvider {
  name = "DIAN_STUB";

  async issueInvoice(request: InvoiceRequest): Promise<InvoiceResponse> {
    console.log(
      `[STUB_PROVIDER] Issuing invoice for Order: ${request.orderId}`,
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Simulate success
    const mockCufe = crypto.randomBytes(20).toString("hex");
    const mockRef = `STUB-INV-${uuidv4().substring(0, 8).toUpperCase()}`;

    return {
      success: true,
      providerRef: mockRef,
      cufe: mockCufe,
      xmlPath: `https://stub-invoicing.com/xml/${mockCufe}`,
      pdfPath: `https://stub-invoicing.com/pdf/${mockCufe}`,
    };
  }

  async checkStatus(providerRef: string) {
    console.log(`[STUB_PROVIDER] Checking status for Ref: ${providerRef}`);

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      status: "ACCEPTED" as const,
      cufe: `CUFE-${providerRef}`,
    };
  }
}
