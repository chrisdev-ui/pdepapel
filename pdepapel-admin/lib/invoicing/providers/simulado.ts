import { InvoiceProvider, InvoiceRequest, InvoiceResponse } from "../types";
import { v4 as uuidv4 } from "uuid";

/**
 * A mock provider designed to simulate DIAN integrations for development/testing
 * before subscribing to a commercial provider like Alegra, Siigo or FacturaScripts
 */
export class SimuladoProvider implements InvoiceProvider {
  /**
   * Simulates the issuance of an electronic invoice.
   * Succeeds with a fake CUFE.
   */
  async issueInvoice(request: InvoiceRequest): Promise<InvoiceResponse> {
    console.log(
      `[SIMULADO_DIAN] Emitting invoice for order ${request.orderId}`,
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const fakeProviderRef = `SIM-${Date.now()}`;
    const fakeCufe = uuidv4().replace(/-/g, "") + uuidv4().replace(/-/g, "");

    return {
      success: true,
      providerRef: fakeProviderRef,
      cufe: fakeCufe,
      xmlPayload: `<Invoice><cac:AccountingSupplierParty>Test</cac:AccountingSupplierParty></Invoice>`,
      xmlPath: `https://simulado.dian.gov.co/xml/${fakeCufe}.xml`,
      pdfPath: `https://simulado.dian.gov.co/pdf/${fakeCufe}.pdf`,
    };
  }

  /**
   * Simulates checking the DIAN status
   * Will always return ACCEPTED for testing logic
   */
  async checkStatus(providerRef: string) {
    console.log(`[SIMULADO_DIAN] Checking status of ${providerRef}`);

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    return {
      status: "ACCEPTED" as const,
    };
  }
}
