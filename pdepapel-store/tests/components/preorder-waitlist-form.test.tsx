// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PREORDER_WAITLIST_CONSENT_TEXT, PreorderWaitlistForm } from "@/components/preorder-waitlist-form";
import { LEGAL_VERSIONS } from "@/lib/legal-versions";

const { trackCustomerEvent } = vi.hoisted(() => ({ trackCustomerEvent: vi.fn() }));

vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent }));

const PHONE = "+573001112233";

const renderForm = () => render(<PreorderWaitlistForm productId="prod-1" productName="Calendario de adviento" />);

describe("PreorderWaitlistForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("muestra la casilla de consentimiento sin marcar y enlazada a la política de privacidad", () => {
    renderForm();
    const checkbox = screen.getByRole("checkbox", { name: new RegExp(PREORDER_WAITLIST_CONSENT_TEXT.slice(0, 30)) });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute("href", "/politicas/privacidad");
  });

  it("no envía sin consentimiento", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    await user.type(screen.getByLabelText("WhatsApp"), PHONE);
    await user.click(screen.getByRole("button", { name: "Avísame" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Marca la casilla");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("no envía sin WhatsApp ni correo", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Avísame" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe tu WhatsApp o tu correo");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("envía el consentimiento con su versión y mide el alta sin datos personales", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { "Content-Type": "application/json" } }),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    await user.type(screen.getByLabelText("Correo"), "ana@example.com");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Avísame" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Listo, te avisamos cuando abra la preventa o llegue.");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/preorder-waitlist\/public$/);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      productId: "prod-1",
      name: "Ana",
      email: "ana@example.com",
      consentText: PREORDER_WAITLIST_CONSENT_TEXT,
      consentVersion: LEGAL_VERSIONS.privacy,
      website: "",
    });
    expect(typeof body.formStartedAt).toBe("number");

    expect(trackCustomerEvent).toHaveBeenCalledTimes(1);
    expect(trackCustomerEvent).toHaveBeenCalledWith("waitlist_signup", { item_id: "prod-1", signup_channel: "web" });
    const params = JSON.stringify(trackCustomerEvent.mock.calls);
    expect(params).not.toMatch(/Ana|ana@example\.com|573001112233/);
    for (const reserved of ["source", "medium", "campaign", "campaign_id", "term", "content"]) {
      expect(trackCustomerEvent.mock.calls[0][1]).not.toHaveProperty(reserved);
    }
  });

  it("si el panel rechaza, muestra el motivo y no mide nada", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "Recarga la página e inténtalo de nuevo" }), { status: 400, headers: { "Content-Type": "application/json" } }),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    await user.type(screen.getByLabelText("WhatsApp"), PHONE);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Avísame" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Recarga la página");
    expect(trackCustomerEvent).not.toHaveBeenCalled();
  });
});
