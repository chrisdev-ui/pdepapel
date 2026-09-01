import { describe, expect, it } from "vitest";

import { cloudinaryImageLoader } from "@/lib/cloudinary-image-loader";

const IMAGE_URL =
  "https://res.cloudinary.com/demo/image/upload/v1785967604/product.jpg";

describe("cloudinaryImageLoader", () => {
  it("builds one responsive transformation with economical automatic quality", () => {
    expect(cloudinaryImageLoader({ src: IMAGE_URL, width: 768 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto:eco,c_limit,w_768/v1785967604/product.jpg",
    );
  });

  it("replaces previous transformations instead of duplicating them", () => {
    expect(
      cloudinaryImageLoader({
        src: "https://res.cloudinary.com/demo/image/upload/c_limit,w_384/c_limit,w_384/f_auto/q_auto/v1785967604/product.jpg?_a=old",
        width: 512,
        quality: 65,
      }),
    ).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_65,c_limit,w_512/v1785967604/product.jpg",
    );
  });

  it("leaves non-Cloudinary images untouched", () => {
    const source = "https://example.com/product.jpg";

    expect(cloudinaryImageLoader({ src: source, width: 768 })).toBe(source);
  });
});
