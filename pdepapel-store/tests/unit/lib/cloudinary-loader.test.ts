import { describe, expect, it } from "vitest";

import { cloudinaryLoader } from "@/lib/cloudinary-loader";

describe("cloudinaryLoader", () => {
  it("inserts format, quality and width transforms into upload urls", () => {
    expect(cloudinaryLoader({ src: "https://res.cloudinary.com/demo/image/upload/v1/folder/pic.jpg", width: 640, quality: 75 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto:75,c_limit,w_640/v1/folder/pic.jpg",
    );
  });

  it("leaves other hosts untouched", () => {
    expect(cloudinaryLoader({ src: "/images/logo.webp", width: 120 })).toBe("/images/logo.webp");
  });
});
