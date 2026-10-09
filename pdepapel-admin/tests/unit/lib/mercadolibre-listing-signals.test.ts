import { describe, expect, it } from "vitest";

import { countPublications } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listings/listing-signals";

describe("countPublications", () => {
  it("escribe el plural sin tilde", () => {
    expect(countPublications(1)).toBe("1 publicación");
    expect(countPublications(3)).toBe("3 publicaciones");
    expect(countPublications(0)).toBe("0 publicaciones");
  });
});
