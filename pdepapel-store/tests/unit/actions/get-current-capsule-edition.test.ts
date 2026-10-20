import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<object>()), cache: <T,>(fn: T) => fn }));

import { getCurrentCapsuleEdition } from "@/actions/get-current-capsule-edition";

const edition = { number: 1, name: "Escritorio", theme: "escritorio", segment: "1-escritorio", coverImage: null, fromPack: { packSize: 5, total: 64500 } };

afterEach(() => vi.unstubAllGlobals());

describe("getCurrentCapsuleEdition", () => {
  it("se guarda 5 minutos con la etiqueta capsules (nunca no-store, va en todas las páginas)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ edition }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getCurrentCapsuleEdition()).resolves.toEqual({ salesEnabled: true, edition });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/capsulas\/actual$/);
    expect(init).toEqual({ next: { revalidate: 300, tags: ["capsules"] } });
  });

  it("sin edición a la venta, con la venta apagada (404) o si el panel falla, esconde todo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ edition: null }), { status: 200 })));
    await expect(getCurrentCapsuleEdition()).resolves.toEqual({ salesEnabled: true, edition: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    await expect(getCurrentCapsuleEdition()).resolves.toEqual({ salesEnabled: false, edition: null });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("caído")));
    await expect(getCurrentCapsuleEdition()).resolves.toEqual({ salesEnabled: false, edition: null });
  });
});
