import { describe, expect, it } from "vitest";

import { shopSearchAliasTarget } from "@/lib/listing-seo";

const target = (path: string) => {
  const url = new URL(path, "https://papeleriapdepapel.com");
  return shopSearchAliasTarget(url.pathname, url.searchParams);
};

describe("?q= como alias de ?search= en /tienda", () => {
  it("pasa el término a search y conserva los demás parámetros", () => {
    expect(target("/tienda?q=agenda")).toBe("/tienda?search=agenda");
    expect(target("/tienda?colorId=c1&q=%20sticker%20")).toBe("/tienda?colorId=c1&search=sticker");
  });

  it("si ya viene search, gana ese y solo quita q", () => {
    expect(target("/tienda?search=cuaderno&q=agenda")).toBe("/tienda?search=cuaderno");
  });

  it("un q vacío deja la tienda sin búsqueda", () => {
    expect(target("/tienda?q=")).toBe("/tienda");
  });

  it("sin q, o fuera de /tienda, no hace nada", () => {
    expect(target("/tienda?search=agenda")).toBeNull();
    expect(target("/categoria/stickers?q=rosa")).toBeNull();
  });
});
