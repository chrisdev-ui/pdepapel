// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { announceDraftSaved, onDraftSaved } from "@/lib/draft-broadcast";

describe("aviso entre pestañas de un borrador guardado", () => {
  const unsubscribers: Array<() => void> = [];
  afterEach(() => unsubscribers.splice(0).forEach((stop) => stop()));

  it("la otra pestaña recibe la llave y el id guardado; otra llave no la molesta", async () => {
    const mine = vi.fn();
    const other = vi.fn();
    unsubscribers.push(onDraftSaved("product-group-form-s1-new", mine), onDraftSaved("product-group-form-s1-otro", other));
    announceDraftSaved("product-group-form-s1-new", "grupo-1");
    await vi.waitFor(() => expect(mine).toHaveBeenCalledWith(expect.objectContaining({ key: "product-group-form-s1-new", savedId: "grupo-1" })));
    expect(other).not.toHaveBeenCalled();
  });
});
