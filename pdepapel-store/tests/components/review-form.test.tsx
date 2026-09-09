/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { post, patch, toast, refresh } = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), toast: vi.fn(), refresh: vi.fn() }));

vi.mock("axios", () => ({ default: { post, patch } }));
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

describe("ReviewForm", () => {
  it("posts a new review to the product id, not to the route param", async () => {
    post.mockResolvedValue({});
    render(<ReviewForm productId="prod-123" reviews={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "5 estrellas" }));
    fireEvent.change(screen.getByLabelText("Comentario"), { target: { value: "Hermoso" } });
    fireEvent.click(screen.getByRole("button", { name: "Publicar reseña" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("https://admin.example.com/api/store/products/prod-123/reviews", { rating: 5, comment: "Hermoso" }, expect.anything()));
    expect(refresh).toHaveBeenCalled();
  });

  it("updates the existing review of the signed-in customer", async () => {
    patch.mockResolvedValue({});
    render(<ReviewForm productId="prod-123" reviews={[{ id: "r9", userId: "u1", name: "Yo", rating: 3, comment: "ok" }]} />);

    fireEvent.click(screen.getByRole("button", { name: "4 estrellas" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith("https://admin.example.com/api/store/products/prod-123/reviews/r9", { rating: 4, comment: "" }, expect.anything()));
  });

  it("asks for a rating before sending", () => {
    render(<ReviewForm productId="prod-123" reviews={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Publicar reseña" }));
    expect(post).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));
  });
});
