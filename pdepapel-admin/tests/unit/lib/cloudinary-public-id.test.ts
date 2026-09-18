import { describe, expect, it, vi } from "vitest";

// `lib/utils` arrastra la validación de env; aquí solo se prueba el parser.
vi.mock("@/lib/env.mjs", () => ({ env: {} }));

import { getPublicIdFromCloudinaryUrl } from "@/lib/utils";

/** El parser solo entendía ids en la raíz: un archivo en carpeta nunca se borraba. */
describe("getPublicIdFromCloudinaryUrl", () => {
  it("parses root ids, foldered ids, versionless urls and transformed urls", () => {
    expect(getPublicIdFromCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/v1785967604/askomxo3o0wt2lkidby7.png")).toBe("askomxo3o0wt2lkidby7");
    expect(getPublicIdFromCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/v1/category-covers/agendas-20260909.png")).toBe("category-covers/agendas-20260909");
    expect(getPublicIdFromCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_640/v1/category-covers/agendas.jpg?x=1")).toBe("category-covers/agendas");
    expect(getPublicIdFromCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/c_limit,w_384/f_auto/q_auto/product.jpg")).toBe("product");
    expect(getPublicIdFromCloudinaryUrl("https://res.cloudinary.com/demo/video/upload/v1/clips/intro.mp4")).toBe("clips/intro");
  });

  it("returns null for anything that is not a Cloudinary upload url", () => {
    expect(getPublicIdFromCloudinaryUrl("/placeholder.png")).toBeNull();
    expect(getPublicIdFromCloudinaryUrl("https://example.com/image/upload/v1/x.png")).toBeNull();
    expect(getPublicIdFromCloudinaryUrl("not a url")).toBeNull();
  });
});
