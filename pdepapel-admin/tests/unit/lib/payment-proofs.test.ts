import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  clientOptions: [] as unknown[],
  env: {
    CLOUDFLARE_R2_ACCOUNT_ID: "acct123",
    CLOUDFLARE_R2_ACCESS_KEY_ID: "access-key",
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret-key",
    CLOUDFLARE_R2_BUCKET_NAME: "pdepapel-comprobantes",
  } as Record<string, string | undefined>,
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public input: Record<string, unknown>) {}
  }
  class PutObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class DeleteObjectCommand extends Command {}
  class S3Client {
    constructor(options: unknown) {
      mocks.clientOptions.push(options);
    }
    send = mocks.send;
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
});
vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return { ...actual, randomUUID: () => "0f3a9c1e-7b2d-4c8e-9a1f-2b3c4d5e6f70" };
});

import {
  deletePaymentProof,
  fetchPaymentProof,
  isPaymentProofStorageConfigured,
  PaymentProofStorageNotConfiguredError,
  PaymentProofValidationError,
  resolvePaymentProof,
  uploadPaymentProof,
} from "@/lib/payment-proofs";

const proofKey = "comprobantes/store-1/0f3a9c1e-7b2d-4c8e-9a1f-2b3c4d5e6f70.jpg";
const commandOf = (call: number) => mocks.send.mock.calls[call][0] as { constructor: { name: string }; input: Record<string, unknown> };

describe("payment proofs (private Cloudflare R2 bucket)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.CLOUDFLARE_R2_ACCOUNT_ID = "acct123";
  });

  it("uploads to the store folder with the file's content type and returns the object key", async () => {
    mocks.send.mockResolvedValue({});
    const key = await uploadPaymentProof({
      storeId: "store-1",
      bytes: Buffer.from("jpegbytes"),
      mimeType: "image/jpeg",
    });
    expect(key).toBe(proofKey);
    const put = commandOf(0);
    expect(put.constructor.name).toBe("PutObjectCommand");
    expect(put.input).toMatchObject({
      Bucket: "pdepapel-comprobantes",
      Key: proofKey,
      ContentType: "image/jpeg",
      ContentLength: 9,
      CacheControl: "private, no-store",
    });
    expect(Buffer.isBuffer(put.input.Body)).toBe(true);
    // El cliente apunta al endpoint S3 de la cuenta R2, nunca a un dominio público.
    expect(mocks.clientOptions[0]).toMatchObject({
      region: "auto",
      endpoint: "https://acct123.r2.cloudflarestorage.com",
      credentials: { accessKeyId: "access-key", secretAccessKey: "secret-key" },
    });
  });

  it("rejects non-image types, empty and oversized files before touching the bucket", async () => {
    await expect(
      uploadPaymentProof({ storeId: "store-1", bytes: Buffer.from("x"), mimeType: "application/pdf" }),
    ).rejects.toBeInstanceOf(PaymentProofValidationError);
    await expect(
      uploadPaymentProof({ storeId: "store-1", bytes: Buffer.alloc(4 * 1024 * 1024 + 1), mimeType: "image/png" }),
    ).rejects.toThrow(/4 MB/);
    await expect(
      uploadPaymentProof({ storeId: "store-1", bytes: Buffer.alloc(0), mimeType: "image/png" }),
    ).rejects.toBeInstanceOf(PaymentProofValidationError);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("resolves only keys of this store", () => {
    expect(resolvePaymentProof(proofKey, "store-1")).toMatchObject({ storeId: "store-1", format: "jpg" });
    expect(resolvePaymentProof(proofKey, "store-2")).toBeNull();
    expect(resolvePaymentProof("productos/store-1/foto.jpg", "store-1")).toBeNull();
  });

  it("reads the object bytes for the owner route and never for a foreign key or a missing object", async () => {
    mocks.send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      ContentType: "image/jpeg",
    });
    const file = await fetchPaymentProof(proofKey, "store-1");
    expect(file?.contentType).toBe("image/jpeg");
    expect(file?.body).toEqual(new Uint8Array([1, 2, 3]));
    const get = commandOf(0);
    expect(get.constructor.name).toBe("GetObjectCommand");
    expect(get.input).toEqual({ Bucket: "pdepapel-comprobantes", Key: proofKey });

    expect(await fetchPaymentProof(proofKey, "store-2")).toBeNull();
    expect(mocks.send).toHaveBeenCalledTimes(1);

    mocks.send.mockRejectedValueOnce(Object.assign(new Error("gone"), { name: "NoSuchKey" }));
    expect(await fetchPaymentProof(proofKey, "store-1")).toBeNull();

    // Sin ContentType en el objeto, se deduce de la extensión de la clave.
    mocks.send.mockResolvedValueOnce({ Body: { transformToByteArray: async () => new Uint8Array([9]) } });
    expect((await fetchPaymentProof(proofKey, "store-1"))?.contentType).toBe("image/jpeg");
  });

  it("deletes the object and refuses foreign keys", async () => {
    mocks.send.mockResolvedValue({});
    expect(await deletePaymentProof(proofKey, "store-1")).toBe(true);
    const del = commandOf(0);
    expect(del.constructor.name).toBe("DeleteObjectCommand");
    expect(del.input).toEqual({ Bucket: "pdepapel-comprobantes", Key: proofKey });
    expect(await deletePaymentProof(proofKey, "store-2")).toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("reports the storage as not configured when any of the four variables is missing", async () => {
    expect(isPaymentProofStorageConfigured()).toBe(true);
    mocks.env.CLOUDFLARE_R2_ACCOUNT_ID = undefined;
    expect(isPaymentProofStorageConfigured()).toBe(false);
    await expect(
      uploadPaymentProof({ storeId: "store-1", bytes: Buffer.from("x"), mimeType: "image/png" }),
    ).rejects.toBeInstanceOf(PaymentProofStorageNotConfiguredError);
    await expect(fetchPaymentProof(proofKey, "store-1")).rejects.toBeInstanceOf(PaymentProofStorageNotConfiguredError);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
