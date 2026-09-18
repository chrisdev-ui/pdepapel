import { describe, expect, it, vi } from "vitest";

import {
  assertNoStandaloneConflicts,
  assertNoStandaloneNameConflicts,
  findStandaloneImageConflicts,
  findStandaloneNameConflicts,
  STANDALONE_PRODUCT_EXISTS,
} from "@/lib/product-group-conflicts";

const client = (
  rows: {
    id: string;
    name: string;
    sku: string | null;
    images?: { url: string }[];
  }[],
) => ({ product: { findMany: vi.fn().mockResolvedValue(rows) } }) as never;

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
      {
        id: "p2",
        name: "cartuchera LUCKY girls",
        sku: "CL-1",
        reason: "name",
        variant: "Cartuchera Lucky Girls",
      },
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
        conflicts: [
          {
            id: "p2",
            name: "Cartuchera lucky girls",
            sku: "CL-1",
            reason: "name",
            variant: "Cartuchera lucky girls",
          },
        ],
      },
    });
  });
});

const URLS = [
  "https://res.cloudinary.com/x/1.jpg",
  "https://res.cloudinary.com/x/2.jpg",
];

describe("findStandaloneImageConflicts", () => {
  it("flags a nameless-id variant whose resolved photos equal a standalone product's full set", async () => {
    const db = client([
      {
        id: "p9",
        name: "Cartuchera Lucky Girls",
        sku: "CLG-0",
        images: URLS.map((url) => ({ url })),
      },
    ]);
    const conflicts = await findStandaloneImageConflicts(
      db,
      "store-1",
      [
        {
          name: "Cartuchera Kawaii lila",
          colorId: "c-lila",
          designId: "d-kawaii",
        },
      ],
      "Cartuchera Kawaii",
      { images: URLS.map((url) => ({ url })), imageMapping: [] },
    );
    expect(conflicts).toEqual([
      {
        id: "p9",
        name: "Cartuchera Lucky Girls",
        sku: "CLG-0",
        reason: "images",
        variant: "Cartuchera Kawaii lila",
      },
    ]);
    const where = (db as { product: { findMany: ReturnType<typeof vi.fn> } })
      .product.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      storeId: "store-1",
      productGroupId: null,
      images: { some: { url: { in: URLS } } },
    });
  });

  it("does not flag a partial overlap or a product the payload adopts", async () => {
    const db = client([
      { id: "p9", name: "Otro", sku: null, images: [{ url: URLS[0] }] },
      {
        id: "p1",
        name: "Adoptado",
        sku: null,
        images: URLS.map((url) => ({ url })),
      },
    ]);
    const conflicts = await findStandaloneImageConflicts(
      db,
      "store-1",
      [
        { id: "p1", colorId: "c", designId: "d" },
        { name: "Nueva", colorId: "c", designId: "d" },
      ],
      "Grupo",
      { images: URLS.map((url) => ({ url })), imageMapping: [] },
    );
    expect(conflicts).toEqual([]);
  });
});

describe("assertNoStandaloneConflicts", () => {
  it("reports both reasons in one 409", async () => {
    const db = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { id: "n1", name: "Cartuchera lucky girls", sku: "A" },
          ])
          .mockResolvedValueOnce([
            {
              id: "i1",
              name: "Cartuchera Lucky Girls",
              sku: "B",
              images: URLS.map((url) => ({ url })),
            },
          ]),
      },
    } as never;
    await expect(
      assertNoStandaloneConflicts(
        db,
        "store-1",
        [{ name: "Cartuchera lucky girls", colorId: "c", designId: "d" }],
        "Cartuchera",
        { images: URLS.map((url) => ({ url })), imageMapping: [] },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("mismas fotos"),
      details: {
        code: STANDALONE_PRODUCT_EXISTS,
        conflicts: [
          expect.objectContaining({ reason: "name" }),
          expect.objectContaining({ reason: "images" }),
        ],
      },
    });
  });
});
