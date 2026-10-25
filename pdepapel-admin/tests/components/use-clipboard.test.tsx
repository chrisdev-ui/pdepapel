// @vitest-environment jsdom

import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { ProductSkuBadge } from "@/components/ui/product-sku-badge";
import { useClipboard, writeClipboard } from "@/hooks/use-clipboard";

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

  it("usa el aviso de cada pantalla cuando copió, y ninguno si la pantalla lo maneja", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { result } = renderHook(() => useClipboard());
    await act(async () => {
      await result.current.onCopy("ABC-1", "SKU", { success: { description: "SKU copiado al portapapeles", variant: "success" } });
    });
    expect(toast).toHaveBeenCalledWith({ description: "SKU copiado al portapapeles", variant: "success" });
    toast.mockReset();
    await act(async () => {
      await result.current.onCopy("x", "Texto", { success: false });
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it("con failure: false la pantalla maneja el error y no sale ningún aviso", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) } });
    const { result } = renderHook(() => useClipboard());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.onCopy("x", "Texto", { failure: false });
    });
    expect(ok).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("writeClipboard", () => {
  it("con HTML escribe HTML y texto plano; sin ClipboardItem cae a solo texto", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });
    vi.stubGlobal("ClipboardItem", class { constructor(public items: Record<string, Blob>) {} });
    await expect(writeClipboard("plano", "<b>plano</b>")).resolves.toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    vi.stubGlobal("ClipboardItem", undefined);
    await expect(writeClipboard("plano", "<b>plano</b>")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("plano");
  });

  it("devuelve false si el navegador niega el portapapeles", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) } });
    await expect(writeClipboard("x")).resolves.toBe(false);
  });
});

describe("una pantalla real: la insignia de SKU", () => {
  it("si el navegador niega la copia, dice «No se pudo copiar» y no «copiado»", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) } });
    const { container } = render(<ProductSkuBadge sku="PDP-001" />);
    await act(async () => {
      fireEvent.click(container.querySelector(".cursor-pointer")!);
    });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "No se pudo copiar: sku", variant: "destructive" });
  });
});
