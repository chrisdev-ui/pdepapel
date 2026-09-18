import { describe, expect, it } from "vitest";

import {
  imagesToSave,
  normalizeProductImages,
  unsavedUploadsToCleanup,
} from "@/lib/product-images";

describe("normalizeProductImages", () => {
  it("keeps the stored main image instead of resetting it to the first one", () => {
    const images = normalizeProductImages([
      { url: "a.jpg", isMain: false },
      { url: "b.jpg", isMain: true },
      { url: "c.jpg", isMain: false },
    ]);
    expect(images.map((image) => image.isMain)).toEqual([false, true, false]);
  });

  it("promotes the first image when none is main and drops duplicates", () => {
    const images = normalizeProductImages([
      { url: "a.jpg" },
      { url: "a.jpg" },
      { url: "b.jpg", isMain: null },
    ]);
    expect(images).toEqual([
      { url: "a.jpg", isMain: true },
      { url: "b.jpg", isMain: false },
    ]);
  });
});

describe("imagesToSave", () => {
  it("drops the pending removals and re-promotes a main image when the main one was removed", () => {
    const saved = imagesToSave(
      [
        { url: "main.jpg", isMain: true },
        { url: "second.jpg", isMain: false },
      ],
      ["main.jpg"],
    );
    expect(saved).toEqual([{ url: "second.jpg", isMain: true }]);
  });

  it("returns an empty list when every photo is marked, so the form can refuse to save", () => {
    expect(imagesToSave([{ url: "a.jpg", isMain: true }], ["a.jpg"])).toEqual([]);
  });
});

describe("unsavedUploadsToCleanup", () => {
  it("only lists removed uploads that never reached the database", () => {
    expect(unsavedUploadsToCleanup(["db.jpg", "new.jpg", "new.jpg"], ["db.jpg"])).toEqual(["new.jpg"]);
  });
});
