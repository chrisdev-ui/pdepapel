/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { trackCustomerEvent } = vi.hoisted(() => ({
  trackCustomerEvent: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/customer-analytics", () => ({
  trackCustomerEvent,
}));

import { AccountPrompt } from "@/components/account-prompt";

describe("AccountPrompt", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers optional account access without changing guest checkout", async () => {
    const user = userEvent.setup();

    render(
      <AccountPrompt source="cart_page" redirectPath="/carrito?from=cart" />,
    );

    expect(
      screen.getByRole("complementary", {
        name: "Opciones para crear cuenta o iniciar sesión",
      }),
    ).toHaveTextContent("Puedes seguir comprando como invitado");
    expect(
      screen.getByText(/en segundos con Google o con tu correo/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/podrás elegirla en pedidos futuros/i),
    ).toBeInTheDocument();

    const signUp = screen.getByRole("link", {
      name: "Crear cuenta gratis",
    });
    expect(signUp).toHaveAttribute(
      "href",
      "/crear-cuenta?redirect_url=%2Fcarrito%3Ffrom%3Dcart",
    );

    signUp.addEventListener("click", (event) => event.preventDefault());
    await user.click(signUp);
    expect(trackCustomerEvent).toHaveBeenCalledWith(
      "account_registration_cta_clicked",
      { source: "cart_page" },
    );
  });

  it("keeps the compact prompt usable in the cart drawer", async () => {
    const user = userEvent.setup();

    render(
      <AccountPrompt
        variant="compact"
        source="cart_drawer"
        redirectPath="/carrito"
      />,
    );

    const signIn = screen.getByRole("link", { name: "Iniciar sesión" });
    expect(signIn).toHaveAttribute(
      "href",
      "/iniciar-sesion?redirect_url=%2Fcarrito",
    );

    signIn.addEventListener("click", (event) => event.preventDefault());
    await user.click(signIn);
    expect(trackCustomerEvent).toHaveBeenCalledWith(
      "account_sign_in_cta_clicked",
      { source: "cart_drawer" },
    );
    expect(
      screen.getByText(/también puedes comprar como invitado/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Crear cuenta" }),
    ).toBeInTheDocument();
  });
});
