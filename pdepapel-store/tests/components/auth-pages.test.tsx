// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Register } from "@/app/(routes)/(user)/crear-cuenta/[[...sign-up]]/components/register";
import { Login } from "@/app/(routes)/(user)/iniciar-sesion/[[...sign-in]]/components/login";

const state = vi.hoisted(() => ({
  search: "",
  auth: { isLoaded: true, isSignedIn: false },
  replace: vi.fn(),
  signInProps: null as Record<string, unknown> | null,
  signUpProps: null as Record<string, unknown> | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => state.auth,
  SignIn: (props: Record<string, unknown>) => {
    state.signInProps = props;
    return <div data-testid="clerk-sign-in" />;
  },
  SignUp: (props: Record<string, unknown>) => {
    state.signUpProps = props;
    return <div data-testid="clerk-sign-up" />;
  },
}));

describe("full-page sign-in and sign-up", () => {
  beforeEach(() => {
    state.search = "";
    state.auth = { isLoaded: true, isSignedIn: false };
    state.signInProps = null;
    state.signUpProps = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the sign-in page with a heading, the benefits panel and the Clerk form", () => {
    render(<Login />);

    expect(screen.getByRole("heading", { level: 1, name: "Bienvenida de nuevo" })).toBeInTheDocument();
    expect(screen.getByText("Tus pedidos y guías en un solo lugar")).toBeInTheDocument();
    expect(screen.getByTestId("clerk-sign-in")).toBeInTheDocument();
    expect(state.signInProps).toMatchObject({
      path: "/iniciar-sesion",
      routing: "path",
      forceRedirectUrl: "/",
      signUpForceRedirectUrl: "/",
      signUpUrl: "/crear-cuenta?redirect_url=%2F",
    });
  });

  it("passes only a sanitized relative redirect to Clerk and to the sign-up link", () => {
    state.search = "redirect_url=%2Fmis-pedidos%3Forden%3D1";
    render(<Login />);

    expect(state.signInProps).toMatchObject({
      forceRedirectUrl: "/mis-pedidos?orden=1",
      signUpForceRedirectUrl: "/mis-pedidos?orden=1",
      signUpUrl: "/crear-cuenta?redirect_url=%2Fmis-pedidos%3Forden%3D1",
    });
    expect(screen.getAllByRole("link", { name: /Volver a la tienda/ })[0]).toHaveAttribute(
      "href",
      "/mis-pedidos?orden=1",
    );
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/iniciar-sesion?redirect_url=%2Fmis-pedidos",
    "/sign-up",
    "javascript:alert(1)",
    "\\\\evil.example",
  ])("falls back to home for the crafted redirect_url %s", (value) => {
    state.search = `redirect_url=${encodeURIComponent(value)}`;
    render(<Register />);

    expect(state.signUpProps).toMatchObject({
      forceRedirectUrl: "/",
      signInForceRedirectUrl: "/",
      signInUrl: "/iniciar-sesion?redirect_url=%2F",
    });
  });

  it("sends an already signed-in visitor to the safe destination instead of rendering the form", () => {
    state.search = "redirect_url=%2Ffavoritos";
    state.auth = { isLoaded: true, isSignedIn: true };
    render(<Login />);

    expect(screen.queryByTestId("clerk-sign-in")).not.toBeInTheDocument();
    expect(state.replace).toHaveBeenCalledWith("/favoritos");
  });

  it("renders the sign-up page with the data policy notice", () => {
    render(<Register />);

    expect(screen.getByRole("heading", { level: 1, name: "Crea tu cuenta" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "política de tratamiento de datos" })).toHaveAttribute(
      "href",
      "/politicas/privacidad",
    );
    expect(state.signUpProps).toMatchObject({ path: "/crear-cuenta", routing: "path" });
  });
});
