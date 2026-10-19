// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("axios", () => ({ default: { get: http.get } }));

import { useGroupVariants } from "@/hooks/use-group-variants";
import { DUPLICATE_VARIANT_MESSAGE, findCombinationOwner } from "@/lib/variant-combinations";

const rosa = { id: "p-rosa", categoryId: "c-agendas", sizeId: "s-1", colorId: "col-rosa", designId: "d-1" };
const azul = { id: "p-azul", categoryId: "c-libretas", sizeId: "s-1", colorId: "col-azul", designId: "d-1" };

afterEach(() => {
  cleanup();
  http.get.mockReset();
});

/**
 * La ficha ya no recibe las variantes de todos los grupos: las del grupo
 * actual llegan con la página y las de otro se piden al elegirlo.
 */
describe("useGroupVariants", () => {
  it("el grupo actual no hace petición; otro grupo se pide una vez y queda guardado", async () => {
    http.get.mockResolvedValue({ data: [azul] });
    const { result, rerender } = renderHook(({ groupId }) => useGroupVariants("store-1", groupId, { id: "g-actual", products: [rosa] }), {
      initialProps: { groupId: "g-actual" as string | null },
    });
    expect(result.current).toEqual([rosa]);
    expect(http.get).not.toHaveBeenCalled();

    rerender({ groupId: "g-otro" });
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toEqual([azul]));
    expect(http.get).toHaveBeenCalledWith("/api/store-1/product-groups/g-otro/combinations");

    rerender({ groupId: "g-actual" });
    rerender({ groupId: "g-otro" });
    expect(result.current).toEqual([azul]);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it("sin grupo no pide nada; si la petición falla queda sin lista (el servidor sigue rechazando)", async () => {
    http.get.mockRejectedValue(new Error("red"));
    const { result, rerender } = renderHook(({ groupId }) => useGroupVariants("store-1", groupId, null), {
      initialProps: { groupId: null as string | null },
    });
    expect(result.current).toBeUndefined();
    expect(http.get).not.toHaveBeenCalled();
    rerender({ groupId: "g-otro" });
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    expect(result.current).toBeUndefined();
  });
});

describe("findCombinationOwner", () => {
  it("encuentra otra variante con la misma combinación y se excluye a sí misma", () => {
    expect(findCombinationOwner([rosa, azul], { sizeId: "s-1", colorId: "col-rosa", designId: "d-1" })).toBe(rosa);
    expect(findCombinationOwner([rosa, azul], { sizeId: "s-1", colorId: "col-rosa", designId: "d-1", excludeId: "p-rosa" })).toBeNull();
    expect(findCombinationOwner([rosa], { sizeId: "s-2", colorId: "col-rosa", designId: "d-1" })).toBeNull();
    expect(DUPLICATE_VARIANT_MESSAGE).toMatch(/ya existe en este grupo/);
  });
});
