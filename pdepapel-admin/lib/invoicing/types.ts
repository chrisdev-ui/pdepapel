/**
 * General Response from any DIAN Provider
 */
export interface InvoiceResponse {
  success: boolean;
  providerRef?: string; // e.g. "INV-1234 Alegra"
  cufe?: string;
  xmlPayload?: string;
  xmlPath?: string;
  pdfPath?: string;
  errorMessage?: string;
}

/**
 * Data needed to generate an electronic invoice
 */
export interface InvoiceRequest {
  orderId: string;
  storeId: string;
  customerName: string;
  customerDocId?: string;
  customerEmail?: string;
  totalAmount: number;
  taxAmount: number;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number; // e.g. 19.0
  }>;
}

/**
 * Interface that all external invoicing providers MUST implement
 */
export interface InvoiceProvider {
  /**
   * Generates and issues the invoice to the DIAN asynchronously
   */
  issueInvoice(request: InvoiceRequest): Promise<InvoiceResponse>;

  /**
   * Queries the invoice status directly from the provider
   */
  checkStatus(providerRef: string): Promise<{
    status: "PENDING" | "ACCEPTED" | "REJECTED";
    cufe?: string;
    xmlPath?: string;
    pdfPath?: string;
  }>;
}
