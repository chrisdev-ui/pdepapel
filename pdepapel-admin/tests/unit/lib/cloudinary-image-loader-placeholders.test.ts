import { afterEach, describe, expect, it, vi } from "vitest";

const PHOTO = "https://res.cloudinary.com/demo/image/upload/v1785967604/product.jpg";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** En local, con la variable puesta, ninguna foto del catálogo sale hacia la nube de producción. */
describe("cloudinaryLoader placeholder mode", () => {
  it("serves the local placeholder for Cloudinary photos when enabled outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_PLACEHOLDERS", "1");
    const { default: cloudinaryLoader } = await import("@/lib/cloudinary-image-loader");
    expect(cloudinaryLoader({ src: PHOTO, width: 640 })).toBe("/placeholder_1.png");
    expect(cloudinaryLoader({ src: "/images/logo.webp", width: 640 })).toBe("/images/logo.webp");
  });

  it("never applies in production, whatever the variable says", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_PLACEHOLDERS", "1");
    const { default: cloudinaryLoader } = await import("@/lib/cloudinary-image-loader");
    expect(cloudinaryLoader({ src: PHOTO, width: 640 })).toContain("res.cloudinary.com");
  });

  it("stays off without the variable", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { default: cloudinaryLoader } = await import("@/lib/cloudinary-image-loader");
    expect(cloudinaryLoader({ src: PHOTO, width: 640 })).toContain("res.cloudinary.com");
  });
});
