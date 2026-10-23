// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { useClipboard } from "@/hooks/use-clipboard";

afterEach(() => {
  toast.mockReset();
  vi.unstubAllGlobals();
});

describe("useClipboard", () => {
  it("copia y avisa que copió", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { result } = renderHook(() => useClipboard());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.onCopy("hola", "Resumen semanal");
    });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hola");
    expect(toast).toHaveBeenCalledWith({ title: "Resumen semanal copiado al portapapeles." });
  });

  it("si el navegador bloquea el portapapeles, no dice que copió", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) } });
    const { result } = renderHook(() => useClipboard());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.onCopy("hola", "Resumen semanal");
    });
    expect(ok).toBe(false);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "No se pudo copiar: resumen semanal", variant: "destructive" });
  });
});
