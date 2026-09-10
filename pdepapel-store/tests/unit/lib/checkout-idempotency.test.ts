import { describe, expect, it } from "vitest";

import {
  createIdempotencyKey,
  getCartSignature,
} from "@/lib/checkout-idempotency";

describe("createIdempotencyKey", () => {
  it("genera claves distintas y válidas para el encabezado", () => {
    const a = createIdempotencyKey();
    const b = createIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });
});

describe("getCartSignature", () => {
  it("no depende del orden y cambia con la cantidad", () => {
    expect(
      getCartSignature([
        { id: "b", quantity: 1 },
        { id: "a", quantity: 2 },
      ]),
    ).toBe(getCartSignature([{ id: "a", quantity: 2 }, { id: "b" , quantity: 1 }]));
    expect(getCartSignature([{ id: "a", quantity: 1 }])).not.toBe(
      getCartSignature([{ id: "a", quantity: 2 }]),
    );
  });
});
