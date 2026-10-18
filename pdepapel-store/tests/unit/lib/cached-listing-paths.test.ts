import { describe, expect, it } from "vitest";

import { cachedListingPath, publicListingPath, publicPathname } from "@/lib/routes";

describe("cached listing paths", () => {
  it("maps only /tienda and a single category segment to the cached copy", () => {
    expect(cachedListingPath("/tienda")).toBe("/catalogo-cache/tienda");
    expect(cachedListingPath("/categoria/stickers")).toBe("/catalogo-cache/categoria/stickers");
    expect(cachedListingPath("/categoria/stickers/x")).toBeNull();
    expect(cachedListingPath("/producto/agenda")).toBeNull();
    expect(cachedListingPath("/marcas/kiut")).toBe("/catalogo-cache/marcas/kiut");
    expect(cachedListingPath("/marcas")).toBeNull();
    expect(cachedListingPath("/marcas/kiut/x")).toBeNull();
  });

  it("sends a cached path back to its public URL, anything unknown to /tienda", () => {
    expect(publicListingPath("/catalogo-cache/categoria/stickers")).toBe("/categoria/stickers");
    expect(publicListingPath("/catalogo-cache/otra")).toBe("/tienda");
    expect(publicListingPath("/tienda")).toBeNull();
  });

  it("shows components the public path, so active links match between server and browser", () => {
    expect(publicPathname("/catalogo-cache/tienda")).toBe("/tienda");
    expect(publicPathname("/catalogo-cache/categoria/stickers")).toBe("/categoria/stickers");
    expect(publicPathname("/catalogo-cache/marcas/kiut")).toBe("/marcas/kiut");
    expect(publicListingPath("/catalogo-cache/marcas/kiut")).toBe("/marcas/kiut");
    expect(publicPathname("/tienda")).toBe("/tienda");
    expect(publicPathname("/catalogo-cachex")).toBe("/catalogo-cachex");
  });
});
