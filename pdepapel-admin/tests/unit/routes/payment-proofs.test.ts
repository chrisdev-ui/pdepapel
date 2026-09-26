import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStoreOwner: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  paymentFindFirst: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/store-access", () => ({ requireStoreOwner: mocks.requireStoreOwner }));
vi.mock("@/lib/prismadb", () => ({
  default: { paymentDetails: { findFirst: mocks.paymentFindFirst } },
}));
// Sin importActual: el módulo real carga env.mjs y el SDK; las clases de error
// se definen aquí y la ruta las recibe por el mismo mock.
vi.mock("@/lib/payment-proofs", () => ({
  PaymentProofValidationError: class PaymentProofValidationError extends Error {},
  PaymentProofStorageNotConfiguredError: class PaymentProofStorageNotConfiguredError extends Error {
    constructor() {
      super("El almacenamiento de comprobantes no está configurado");
    }
  },
  uploadPaymentProof: mocks.upload,
  deletePaymentProof: mocks.remove,
}));

import { ErrorFactory } from "@/lib/api-errors";
import { PaymentProofStorageNotConfiguredError, PaymentProofValidationError } from "@/lib/payment-proofs";
import { DELETE, POST } from "@/app/api/[storeId]/payment-proofs/route";

const params = { params: { storeId: "store-1" } };
const proofKey = "comprobantes/store-1/0f3a9c1e-7b2d-4c8e-9a1f-2b3c4d5e6f70.jpg";

function multipart(file: Blob | null) {
  const body = new FormData();
  if (file) body.append("file", file, "captura.png");
  return new Request("https://admin.test/api/store-1/payment-proofs", { method: "POST", body });
}

describe("POST /api/[storeId]/payment-proofs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStoreOwner.mockResolvedValue("user_1");
  });

  it("requires the owner session", async () => {
    mocks.requireStoreOwner.mockRejectedValueOnce(ErrorFactory.Unauthenticated());
    const response = await POST(multipart(new Blob(["x"], { type: "image/png" })), params);
    expect(response.status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uploads the file through the server and returns the object key", async () => {
    mocks.upload.mockResolvedValue(proofKey);
    const response = await POST(multipart(new Blob(["pngbytes"], { type: "image/png" })), params);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ proofKey });
    expect(response.headers.get("cache-control")).toContain("no-store");
    const call = mocks.upload.mock.calls[0][0];
    expect(call.storeId).toBe("store-1");
    expect(call.mimeType).toBe("image/png");
    expect(Buffer.isBuffer(call.bytes)).toBe(true);
    expect(call.bytes.toString()).toBe("pngbytes");
  });

  it("answers 400 with the validation message for a bad type or size", async () => {
    mocks.upload.mockRejectedValue(new PaymentProofValidationError("El comprobante debe ser una imagen (JPG, PNG o WebP)"));
    const response = await POST(multipart(new Blob(["%PDF"], { type: "application/pdf" })), params);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/imagen/);
  });

  it("answers 503 when the bucket is not configured", async () => {
    mocks.upload.mockRejectedValue(new PaymentProofStorageNotConfiguredError());
    const response = await POST(multipart(new Blob(["png"], { type: "image/png" })), params);
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/no está configurado/);
  });

  it("rejects a request without a file or with a declared size over the cap", async () => {
    expect((await POST(multipart(null), params)).status).toBe(400);
    const big = new Request("https://admin.test/api/store-1/payment-proofs", {
      method: "POST",
      headers: { "content-length": String(10 * 1024 * 1024) },
      body: new FormData(),
    });
    const response = await POST(big, params);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/4 MB/);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/[storeId]/payment-proofs", () => {
  const request = (body: unknown) =>
    new Request("https://admin.test/api/store-1/payment-proofs", { method: "DELETE", body: JSON.stringify(body) });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStoreOwner.mockResolvedValue("user_1");
    mocks.paymentFindFirst.mockResolvedValue(null);
  });

  it("deletes an unused proof of the store", async () => {
    mocks.remove.mockResolvedValue(true);
    const response = await DELETE(request({ proofKey }), params);
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(proofKey, "store-1");
  });

  it("keeps a proof that already belongs to a registered sale", async () => {
    mocks.paymentFindFirst.mockResolvedValue({ id: "pay-1" });
    const response = await DELETE(request({ proofKey }), params);
    expect(response.status).toBe(409);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("answers 400 for a key that is not a proof of this store", async () => {
    mocks.remove.mockResolvedValue(false);
    expect((await DELETE(request({ proofKey: "productos/store-1/foto.jpg" }), params)).status).toBe(400);
    expect((await DELETE(request({}), params)).status).toBe(400);
  });

  it("requires the owner session", async () => {
    mocks.requireStoreOwner.mockRejectedValueOnce(ErrorFactory.Unauthorized());
    expect((await DELETE(request({ proofKey }), params)).status).toBe(403);
  });
});
