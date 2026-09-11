/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, patch, toast, refresh } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), toast: vi.fn(), refresh: vi.fn() }));

vi.mock("axios", () => ({ default: { get, post, patch } }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "u1", getToken: async () => "token" }),
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/producto/x", useRouter: () => ({ refresh }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/env.mjs", () => ({ env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store" } }));

import { ReviewForm } from "@/components/reviews/review-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  get.mockResolvedValue({ data: { review: null } });
});

describe("ReviewForm", () => {
  it("posts a new review to the product id, not to the route param", async () => {
    post.mockResolvedValue({});
    render(<ReviewForm productId="prod-123" />);

    fireEvent.click(screen.getByRole("button", { name: "5 estrellas" }));
    fireEvent.change(screen.getByLabelText("Comentario"), { target: { value: "Hermoso" } });
    fireEvent.click(screen.getByRole("button", { name: "Publicar reseña" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("https://admin.example.com/api/store/products/prod-123/reviews", { rating: 5, comment: "Hermoso" }, expect.anything()));
    expect(refresh).toHaveBeenCalled();
  });

  it("updates the existing review of the signed-in customer, found through the authenticated endpoint", async () => {
    patch.mockResolvedValue({});
    get.mockResolvedValue({ data: { review: { id: "r9", name: "Yo", rating: 3, comment: "ok" } } });
    render(<ReviewForm productId="prod-123" />);

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "https://admin.example.com/api/store/products/prod-123/reviews/mine",
        expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "4 estrellas" }));
    fireEvent.click(await screen.findByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith("https://admin.example.com/api/store/products/prod-123/reviews/r9", { rating: 4, comment: "" }, expect.anything()));
  });

  it("asks for a rating before sending", () => {
    render(<ReviewForm productId="prod-123" />);
    fireEvent.click(screen.getByRole("button", { name: "Publicar reseña" }));
    expect(post).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));
  });
});
