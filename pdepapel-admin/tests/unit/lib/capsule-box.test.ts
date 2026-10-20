import { describe, expect, it } from "vitest";

import { suggestCapsuleBox } from "@/lib/capsule-box";

const boxes = [
  { name: "Caja S", type: "S", isDefault: true },
  { name: "Caja M vieja", type: "M", isDefault: false },
  { name: "Caja M", type: "M", isDefault: true },
  { name: "Caja L", type: "L", isDefault: true },
];

describe("suggestCapsuleBox", () => {
  it("un pack pequeño de productos pequeños va en la caja S", () => {
    expect(suggestCapsuleBox(Array(5).fill("XS-L"), boxes)).toEqual({ type: "S", name: "Caja S" });
  });

  it("sube por cantidad aunque todo sea pequeño", () => {
    expect(suggestCapsuleBox(Array(15).fill("S-L"), boxes)).toEqual({ type: "M", name: "Caja M" });
    expect(suggestCapsuleBox(Array(30).fill("S-L"), boxes)).toEqual({ type: "L", name: "Caja L" });
  });

  it("sube por el producto más grande; una talla ilegible cuenta como M", () => {
    expect(suggestCapsuleBox(["S-L", "S-L", "L-P", "S-L", "S-L"], boxes)).toEqual({ type: "L", name: "Caja L" });
    expect(suggestCapsuleBox(["S-L", null, "S-L", "S-L", "S-L"], boxes)).toEqual({ type: "M", name: "Caja M" });
  });

  it("para cotizar el peor caso: el producto más grande de toda la bolsa y la cantidad del pack", () => {
    expect(suggestCapsuleBox(["XS-L", "L-P"], boxes, 5)).toEqual({ type: "L", name: "Caja L" });
    expect(suggestCapsuleBox(["XS-L", "S-L"], boxes, 30)).toEqual({ type: "L", name: "Caja L" });
    expect(suggestCapsuleBox(["XS-L"], boxes, 12)).toEqual({ type: "M", name: "Caja M" });
  });

  it("sin una caja de ese tipo en la tienda, devuelve solo el tipo", () => {
    expect(suggestCapsuleBox(["XL-P", "S-L", "S-L", "S-L", "S-L"], boxes)).toEqual({ type: "XL", name: null });
  });
});
