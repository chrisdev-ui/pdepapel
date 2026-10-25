// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn() }));

import { ShareButton } from "@/components/share-button";
import { COPY_FAILED, useClipboard, writeClipboard } from "@/hooks/use-clipboard";

afterEach(() => {
  cleanup();
  toast.mockReset();
  vi.unstubAllGlobals();
});

const denied = () => vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) } });

describe("useClipboard (tienda)", () => {
  it("copia y muestra el aviso de la pantalla", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { result } = renderHook(() => useClipboard());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.onCopy("REF-PRUEBA-01", { success: { title: "¡Copiado con éxito!", variant: "success" } });
    });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("REF-PRUEBA-01");
    expect(toast).toHaveBeenCalledWith({ title: "¡Copiado con éxito!", variant: "success" });
  });

  it("si el navegador niega la copia, dice «No se pudo copiar» y nunca «Copiado»", async () => {
    denied();
    const { result } = renderHook(() => useClipboard());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.onCopy("REF-PRUEBA-01", { success: { title: "¡Copiado con éxito!", variant: "success" } });
    });
    expect(ok).toBe(false);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(COPY_FAILED);
  });

  it("writeClipboard devuelve false cuando el navegador niega el permiso", async () => {
    denied();
    await expect(writeClipboard("x")).resolves.toBe(false);
  });
});

describe("compartir sin share nativo", () => {
  it("con el portapapeles negado no dice «Enlace copiado»", async () => {
    denied();
    render(<ShareButton title="Libreta" path="/producto/libreta" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatchObject({ variant: "warning", description: "No pudimos compartir el enlace. Cópialo desde la barra de direcciones." });
  });
});
