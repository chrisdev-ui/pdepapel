// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/product-list", () => ({
  ProductList: ({ title, eyebrow, products }: { title: string; eyebrow: string; products: { name: string }[] }) => (
    <section data-testid="suggestions">
      <h2>{title}</h2>
      <p>{eyebrow}</p>
      {products.map((product) => (
        <span key={product.name}>{product.name}</span>
      ))}
    </section>
  ),
}));
vi.mock("@/lib/env.mjs", () => ({ env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store" } }));
vi.mock("@/lib/catalog-client", () => ({ fetchCatalogFromClient: vi.fn() }));
vi.mock("@/providers/storefront-settings-provider", () => ({ useStorefrontSettings: () => ({ freeShippingThreshold: 250000 }) }));

import Cart from "@/app/(routes)/carrito/components/cart";
import type { Product } from "@/types";

const product = (name: string) => ({ id: name, slug: name, name, price: "1000", stock: 3, images: [], reviews: [] }) as unknown as Product;

/**
 * CLS del carrito: la lista de sugerencias aparecía al montar, debajo del
 * esqueleto, y empujaba el pie de página (0,14 en escritorio). Ahora viene en
 * el HTML del servidor, al lado del esqueleto, con sus cuatro productos.
 */
describe("Cart skeleton", () => {
  it("renders the suggestions in the server html while the cart is loading", () => {
    const html = renderToString(<Cart suggestions={["A", "B", "C", "D", "E"].map(product)} categories={[]} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Completa tu pedido");
    expect(html).toContain("Lo más pedido");
    for (const name of ["A", "B", "C", "D"]) expect(html).toContain(`<span>${name}</span>`);
    expect(html).not.toContain("<span>E</span>");
  });

  it("renders no suggestion block when the server sent none", () => {
    expect(renderToString(<Cart suggestions={[]} categories={[]} />)).not.toContain("Completa tu pedido");
  });
});
