// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmClient } from "@/app/(routes)/suscripcion/confirmar/confirm-client";

const TOKEN = "t".repeat(43);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("página de confirmación del boletín", () => {
  it("con un enlace válido muestra el botón y no confirma al abrirse", async () => {
    render(<ConfirmClient token={TOKEN} initialStatus="valid" />);
    expect(screen.getByRole("button", { name: "Confirmar mi suscripción" })).toBeEnabled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("solo el clic manda el POST con el token, y luego muestra la confirmación", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ status: "confirmed" }));
    const user = userEvent.setup();
    render(<ConfirmClient token={TOKEN} initialStatus="valid" />);

    await user.click(screen.getByRole("button", { name: "Confirmar mi suscripción" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/newsletter\/confirm$/);
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ token: TOKEN }) });
    expect(await screen.findByRole("heading", { name: "¡Suscripción confirmada!" })).toBeVisible();
  });

  it.each([
    ["already_confirmed", "Tu suscripción ya estaba confirmada"],
    ["expired", "El enlace ya venció"],
    ["invalid", "No pudimos confirmar el enlace"],
    ["error", "No pudimos confirmar ahora"],
  ] as const)("el estado %s se explica sin botón de confirmar", (status, title) => {
    render(<ConfirmClient token={TOKEN} initialStatus={status} />);
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirmar mi suscripción" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("si el panel no responde, lo dice sin perder la calma", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<ConfirmClient token={TOKEN} initialStatus="valid" />);
    await user.click(screen.getByRole("button", { name: "Confirmar mi suscripción" }));
    expect(await screen.findByRole("heading", { name: "No pudimos confirmar ahora" })).toBeVisible();
  });
});

describe("página del servidor", () => {
  it("solo pide el estado del enlace con GET", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ status: "valid" }));
    const { default: Page } = await import("@/app/(routes)/suscripcion/confirmar/page");
    render(await Page({ searchParams: { token: TOKEN } }));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain(`/newsletter/confirm?token=${TOKEN}`);
    expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    expect(screen.getByRole("button", { name: "Confirmar mi suscripción" })).toBeVisible();
  });
});
