// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewsletterForm } from "@/components/newsletter-form";

const { toast, trackCustomerEvent } = vi.hoisted(() => ({
  toast: vi.fn(),
  trackCustomerEvent: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent }));
vi.mock("next/navigation", () => ({ usePathname: () => "/tienda" }));

describe("NewsletterForm", () => {
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

  it("requires explicit marketing consent before submitting", async () => {
    const user = userEvent.setup();
    render(<NewsletterForm />);

    await user.type(
      screen.getByRole("textbox", { name: "Correo electrónico" }),
      "cliente@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: "Quiero recibir novedades" }),
    );

    expect(
      await screen.findByText("Autoriza el envío de novedades para continuar"),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requests confirmation without sending the email address to analytics", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Revisa tu correo y confirma la suscripción.",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(<NewsletterForm />);

    await user.type(
      screen.getByRole("textbox", { name: "Correo electrónico" }),
      "cliente@example.com",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /Autorizo hasta dos correos/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Quiero recibir novedades" }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "/api/newsletter",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      await screen.findByText("Revisa tu correo y confirma la suscripción."),
    ).toBeVisible();
    expect(trackCustomerEvent).toHaveBeenCalledWith(
      "newsletter_confirmation_requested",
      { source: "/tienda" },
    );
    expect(JSON.stringify(trackCustomerEvent.mock.calls)).not.toContain(
      "cliente@example.com",
    );
  });
});
