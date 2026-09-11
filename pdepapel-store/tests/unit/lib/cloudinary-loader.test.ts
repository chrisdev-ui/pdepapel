import { describe, expect, it } from "vitest";

import { CLOUDINARY_MAX_WIDTH, cloudinaryLoader, getCloudinaryImageUrl, isCloudinaryUrl } from "@/lib/cloudinary-loader";

const IMAGE_URL = "https://res.cloudinary.com/demo/image/upload/v1785967604/product.jpg";

describe("cloudinaryLoader", () => {
  it("builds one delivery transformation with automatic format and quality", () => {
    expect(cloudinaryLoader({ src: IMAGE_URL, width: 640 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_640/v1785967604/product.jpg",
    );
  });

  it("ignores the numeric quality so every view shares the same derived copy", () => {
    expect(cloudinaryLoader({ src: IMAGE_URL, width: 640, quality: 75 })).toBe(cloudinaryLoader({ src: IMAGE_URL, width: 640 }));
  });

  it("caps the requested width so oversized srcset entries reuse one copy", () => {
    expect(cloudinaryLoader({ src: IMAGE_URL, width: 3840 })).toBe(
      `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_${CLOUDINARY_MAX_WIDTH}/v1785967604/product.jpg`,
    );
  });

  it("keeps folders after the version segment", () => {
    expect(cloudinaryLoader({ src: "https://res.cloudinary.com/demo/image/upload/v1/category-covers/pic.jpg", width: 384 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_384/v1/category-covers/pic.jpg",
    );
  });

  it("replaces previous transformations and query strings instead of chaining them", () => {
    expect(
      cloudinaryLoader({
        src: "https://res.cloudinary.com/demo/image/upload/c_limit,w_384/c_limit,w_384/f_auto/q_auto/v1785967604/product.jpg?_a=old",
        width: 512,
      }),
    ).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_512/v1785967604/product.jpg");
  });

  it("inserts the transformation when the url has no version segment", () => {
    expect(cloudinaryLoader({ src: "https://res.cloudinary.com/demo/image/upload/product.jpg", width: 256 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_256/product.jpg",
    );
  });

  it("leaves local and third-party images untouched", () => {
    expect(cloudinaryLoader({ src: "/images/logo.webp", width: 120 })).toBe("/images/logo.webp");
    expect(cloudinaryLoader({ src: "https://example.com/product.jpg", width: 768 })).toBe("https://example.com/product.jpg");
    expect(cloudinaryLoader({ src: "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4", width: 768 })).toBe(
      "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
    );
  });

  it("exposes the url helper and the host check", () => {
    expect(isCloudinaryUrl(IMAGE_URL)).toBe(true);
    expect(isCloudinaryUrl("not a url")).toBe(false);
    expect(getCloudinaryImageUrl(IMAGE_URL, 128)).toContain("w_128/");
  });
});
