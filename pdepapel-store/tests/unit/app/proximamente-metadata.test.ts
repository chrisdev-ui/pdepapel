import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getProducts: vi.fn() }));

vi.mock("@/actions/get-products", () => ({ getProducts: mocks.getProducts }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

import { generateMetadata } from "@/app/(routes)/proximamente/page";

/** Una página de «lo que viene» sin productos es contenido delgado: noindex. */
describe("/proximamente metadata", () => {
  it("is noindex,follow while nothing is coming", async () => {
    mocks.getProducts.mockResolvedValue({ products: [] });
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: true });
  });

  it("is indexable, with its own canonical, when there are coming-soon products", async () => {
    mocks.getProducts.mockResolvedValue({ products: [{ id: "llega" }] });
    const metadata = await generateMetadata();
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe("/proximamente");
  });
});
