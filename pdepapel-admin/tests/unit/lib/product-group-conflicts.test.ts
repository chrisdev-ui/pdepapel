import { describe, expect, it, vi } from "vitest";

import {
  assertNoStandaloneNameConflicts,
  findStandaloneNameConflicts,
  STANDALONE_PRODUCT_EXISTS,
} from "@/lib/product-group-conflicts";

const client = (rows: { id: string; name: string; sku: string | null }[]) =>
  ({ product: { findMany: vi.fn().mockResolvedValue(rows) } }) as never;

describe("findStandaloneNameConflicts", () => {
  it("skips variants that adopt a product by id and only looks up the rest", async () => {
    const db = client([]);
    await findStandaloneNameConflicts(
      db,
      "store-1",
      [
        { id: "p1", name: "Cartuchera panda" },
        { name: "Cartuchera lucky girls" },
        { name: "" },
      ],
      "Cartuchera",
    );
    const call = (db as { product: { findMany: ReturnType<typeof vi.fn> } })
      .product.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      storeId: "store-1",
      productGroupId: null,
      name: { in: ["Cartuchera lucky girls", "Cartuchera"] },
    });
  });

  it("matches names case-insensitively and ignores the products the payload adopts", async () => {
    const db = client([
      { id: "p1", name: "Cartuchera Panda", sku: "CP-1" },
      { id: "p2", name: "cartuchera LUCKY girls", sku: "CL-1" },
    ]);
    const conflicts = await findStandaloneNameConflicts(
      db,
      "store-1",
      [
        { id: "p1", name: "Cartuchera Panda" },
        { name: "Cartuchera Lucky Girls" },
      ],
      "Cartuchera",
    );
    expect(conflicts).toEqual([
      { id: "p2", name: "cartuchera LUCKY girls", sku: "CL-1" },
    ]);
  });

  it("does not query at all when every variant adopts by id", async () => {
    const db = client([]);
    const conflicts = await findStandaloneNameConflicts(
      db,
      "store-1",
      [{ id: "p1", name: "X" }],
      "X",
    );
    expect(conflicts).toEqual([]);
    expect(
      (db as { product: { findMany: ReturnType<typeof vi.fn> } }).product
        .findMany,
    ).not.toHaveBeenCalled();
  });
});

describe("assertNoStandaloneNameConflicts", () => {
  it("throws a 409 naming the conflicting product", async () => {
    const db = client([
      { id: "p2", name: "Cartuchera lucky girls", sku: "CL-1" },
    ]);
    await expect(
      assertNoStandaloneNameConflicts(
        db,
        "store-1",
        [{ name: "Cartuchera lucky girls" }],
        "Cartuchera",
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("«Cartuchera lucky girls»"),
      details: {
        code: STANDALONE_PRODUCT_EXISTS,
        conflicts: [{ id: "p2", name: "Cartuchera lucky girls", sku: "CL-1" }],
      },
    });
  });
});
