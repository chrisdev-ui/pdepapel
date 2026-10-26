import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkIfStoreOwner: vi.fn(),
  storeFindFirst: vi.fn(),
  orderFindUnique: vi.fn(),
  invoiceFindFirst: vi.fn(),
  invoiceCount: vi.fn(),
  invoiceCreate: vi.fn(),
  invoiceUpdate: vi.fn(),
  issueInvoice: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/server/utils", () => ({ checkIfStoreOwner: mocks.checkIfStoreOwner }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    store: { findFirst: mocks.storeFindFirst },
    order: { findUnique: mocks.orderFindUnique },
    invoice: {
      findFirst: mocks.invoiceFindFirst,
      count: mocks.invoiceCount,
      create: mocks.invoiceCreate,
      update: mocks.invoiceUpdate,
    },
  },
}));
vi.mock("@/lib/invoicing/providers/simulado", () => ({
  SimuladoProvider: class {
    issueInvoice = mocks.issueInvoice;
  },
}));

import { POST } from "@/app/api/[storeId]/invoices/route";

const baseOrder = {
  id: "order-1",
  storeId: "store-1",
  fullName: "Ana María Torres",
  email: "ana@ejemplo.com",
  daneCode: "11001000",
  total: 30000,
  orderItems: [{ quantity: 1, price: 30000, product: { name: "Agenda" } }],
};

async function issue(order: Record<string, unknown>) {
  mocks.orderFindUnique.mockResolvedValue(order);
  const response = await POST(
    new Request("https://admin.example.com/api/store-1/invoices", {
      method: "POST",
      body: JSON.stringify({ orderId: "order-1" }),
    }),
    { params: { storeId: "store-1" } },
  );
  return { response, created: mocks.invoiceCreate.mock.calls[0]?.[0]?.data };
}

describe("POST /invoices: documento del cliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.checkIfStoreOwner.mockResolvedValue(true);
    mocks.storeFindFirst.mockResolvedValue({ id: "store-1" });
    mocks.invoiceFindFirst.mockResolvedValue(null);
    mocks.invoiceCount.mockResolvedValue(0);
    mocks.invoiceCreate.mockImplementation(async ({ data }) => ({ id: "inv-1", ...data }));
    mocks.invoiceUpdate.mockImplementation(async ({ data }) => ({ id: "inv-1", ...data }));
    mocks.issueInvoice.mockResolvedValue({ success: true, cufe: "c", providerRef: "r" });
  });

  it("guarda el documento real del pedido y se lo manda al proveedor", async () => {
    const { response, created } = await issue({ ...baseOrder, documentId: "1047452823" });
    expect(response.status).toBe(200);
    expect(created.customerDocId).toBe("1047452823");
    expect(mocks.issueInvoice).toHaveBeenCalledWith(expect.objectContaining({ customerDocId: "1047452823" }));
  });

  it("sin documento queda vacío (consumidor final), no el código DANE de la ciudad", async () => {
    const { created } = await issue({ ...baseOrder, documentId: "" });
    expect(created.customerDocId).toBeNull();
    expect(created.customerDocId).not.toBe("11001000");
    expect(mocks.issueInvoice).toHaveBeenCalledWith(expect.objectContaining({ customerDocId: undefined }));
  });
});
