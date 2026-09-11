import { describe, expect, it } from "vitest";

import cloudinaryImageLoader, {
  CLOUDINARY_MAX_WIDTH,
  getCloudinaryImageUrl,
  isCloudinaryUrl,
} from "@/lib/cloudinary-image-loader";

const IMAGE_URL = "https://res.cloudinary.com/demo/image/upload/v1785967604/product.jpg";

describe("cloudinaryImageLoader", () => {
  it("delivers catalog photos through one automatic transformation", () => {
    expect(cloudinaryImageLoader({ src: IMAGE_URL, width: 64 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_64/v1785967604/product.jpg",
    );
  });

  it("ignores the numeric quality and caps the width", () => {
    expect(cloudinaryImageLoader({ src: IMAGE_URL, width: 256, quality: 75 })).toBe(
      cloudinaryImageLoader({ src: IMAGE_URL, width: 256 }),
    );
    expect(cloudinaryImageLoader({ src: IMAGE_URL, width: 4000 })).toContain(`w_${CLOUDINARY_MAX_WIDTH}/`);
  });

  it("replaces previous transformations instead of chaining them", () => {
    expect(
      getCloudinaryImageUrl(
        "https://res.cloudinary.com/demo/image/upload/c_limit,w_384/f_auto/q_auto/v1785967604/product.jpg?x=1",
        128,
      ),
    ).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_128/v1785967604/product.jpg");
  });

  it("leaves placeholders, carrier logos, data urls and videos untouched", () => {
    for (const src of [
      "/placeholder.png",
      "/images/placeholder_1.png",
      "https://www.envioclickpro.com.co/img/register/logo_solo.svg",
      "data:image/png;base64,AAAA",
      "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
    ]) {
      expect(cloudinaryImageLoader({ src, width: 64 })).toBe(src);
    }
    expect(isCloudinaryUrl(IMAGE_URL)).toBe(true);
    expect(isCloudinaryUrl("/placeholder.png")).toBe(false);
  });
});
