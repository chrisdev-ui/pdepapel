// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTACT_SUBJECTS,
  ContactForm,
} from "@/app/(routes)/contacto/components/contact-form";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

describe("ContactForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("offers every subject as a selectable chip", () => {
    render(<ContactForm />);

    const group = screen.getByRole("radiogroup", { name: "Asunto" });
    const chips = screen.getAllByRole("radio");

    expect(group).toBeInTheDocument();
    expect(chips.map((chip) => chip.textContent)).toEqual([
      ...CONTACT_SUBJECTS,
    ]);
    chips.forEach((chip) =>
      expect(chip).toHaveAttribute("aria-checked", "false"),
    );
  });

  it("sends the selected subject with the message", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    render(<ContactForm />);

    await user.type(
      screen.getByRole("textbox", { name: /Nombre/ }),
      "Cliente kawaii",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Correo electrónico/ }),
      "cliente@example.com",
    );
    await user.click(screen.getByRole("radio", { name: "Envíos" }));

    expect(screen.getByRole("radio", { name: "Envíos" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /Enviar mensaje/ }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: "Cliente kawaii",
      email: "cliente@example.com",
      subject: "Envíos",
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success" }),
    );
  });

  it("clears the subject when the selected chip is clicked again", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    const chip = screen.getByRole("radio", { name: "Mi pedido" });
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-checked", "true");

    await user.click(chip);
    expect(chip).toHaveAttribute("aria-checked", "false");
  });
});
