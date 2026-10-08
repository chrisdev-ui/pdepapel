import { describe, expect, it } from "vitest";

import { outOfRangePageTarget } from "@/lib/listing-seo";
import { formatResultRange } from "@/lib/shop-filters";

describe("página fuera de rango (B3)", () => {
  it("manda a la última página y conserva los filtros", () => {
    expect(outOfRangePageTarget("/tienda", { page: "99", typeId: "t1" }, 24)).toBe("/tienda?page=24&typeId=t1");
  });

  it("si solo hay una página, quita el parámetro", () => {
    expect(outOfRangePageTarget("/categoria/stickers", { page: "2" }, 1)).toBe("/categoria/stickers");
  });

  it("no hace nada dentro del rango, sin resultados o con una página inválida", () => {
    expect(outOfRangePageTarget("/tienda", { page: "3" }, 24)).toBeNull();
    expect(outOfRangePageTarget("/tienda", { page: "5" }, 0)).toBeNull();
    expect(outOfRangePageTarget("/tienda", { page: "abc" }, 3)).toBeNull();
    expect(outOfRangePageTarget("/tienda", {}, 3)).toBeNull();
  });
});

describe("formatResultRange", () => {
  it("nunca muestra un rango imposible", () => {
    expect(formatResultRange(2, 24, 24)).toBe("Mostrando 1–24 de 24 productos");
    expect(formatResultRange(99, 24, 573)).toBe("Mostrando 553–573 de 573 productos");
  });
});
