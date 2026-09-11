// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", postId: "post-1" }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-form-persist", () => ({
  useFormPersist: () => ({ clearStorage: vi.fn() }),
}));
vi.mock("@/hooks/use-form-validation-toast", () => ({
  useFormValidationToast: () => undefined,
}));
vi.mock("axios", () => ({
  default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { PostForm } from "@/app/(dashboard)/[storeId]/(routes)/publicaciones/[postId]/components/post-form";

const existingPost = {
  id: "post-1",
  storeId: "store-1",
  social: "Instagram" as const,
  postId: "CxYz123AbCd",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-01T00:00:00Z"),
};

afterEach(() => cleanup());

describe("PostForm", () => {
  it("shows the extracted id and a link to the post when a link is pasted", async () => {
    render(<PostForm initialData={existingPost} />);

    const input = screen.getByLabelText(/Enlace o identificador/);
    fireEvent.change(input, {
      target: { value: "https://www.instagram.com/reel/AbCdEf123_x/?igsh=zzz" },
    });

    const preview = await screen.findByTestId("post-id-preview");
    expect(preview).toHaveTextContent("Identificador detectado: AbCdEf123_x");
    expect(screen.getByRole("link", { name: /Ver publicación/ })).toHaveAttribute(
      "href",
      "https://www.instagram.com/p/AbCdEf123_x/",
    );
  });

  it("explains, in Spanish, when the input is not a valid id for the network", async () => {
    render(<PostForm initialData={existingPost} />);

    fireEvent.change(screen.getByLabelText(/Enlace o identificador/), {
      target: { value: "https://www.tiktok.com/@x/video/7234567890123456789" },
    });

    const preview = await screen.findByTestId("post-id-preview");
    expect(preview).toHaveTextContent(
      "No parece un identificador de Instagram. Pega el enlace de la publicación o el código que va después de /p/.",
    );
    expect(screen.queryByRole("link", { name: /Ver publicación/ })).toBeNull();
  });

  it("uses 'publicación' wording, Spanish labels and per-network help", () => {
    render(<PostForm initialData={existingPost} />);

    expect(
      screen.getByRole("heading", { name: "Editar publicación" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toHaveAttribute("type", "submit");
    expect(screen.getByRole("button", { name: "Volver a Redes en la tienda" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Eliminar publicación" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/el código que va después de \/p\//)).toBeInTheDocument();
    expect(screen.queryByText(/\bpost\b/i)).toBeNull();
  });

  it("asks to pick the network first when creating a new publication", () => {
    render(<PostForm initialData={null} />);

    expect(
      screen.getByRole("heading", { name: "Nueva publicación" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Elige primero la red social/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("post-id-preview")).toBeNull();
  });
});
