// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImageUpload } from "@/components/ui/image-upload";

const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn() }));

vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }) }));
vi.mock("next/image", () => ({ default: (props: React.ComponentProps<"img">) => <img {...props} alt={props.alt ?? ""} /> }));
vi.mock("next-cloudinary", () => ({
  CldUploadWidget: ({ children }: { children: (api: { open: () => void }) => React.ReactNode }) => <>{children({ open: () => undefined })}</>,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/env.mjs", () => ({ env: { NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME: "" } }));
vi.mock("axios", () => ({ default: { post: mocks.post } }));

function Harness() {
  const [images, setImages] = useState<{ url: string; isMain?: boolean }[]>([
    { url: "https://res.cloudinary.com/x/a.jpg", isMain: true },
    { url: "https://res.cloudinary.com/x/b.jpg", isMain: false },
  ]);
  const [pending, setPending] = useState<string[]>([]);
  return (
    <ImageUpload
      value={images}
      onChange={setImages}
      pendingRemovals={pending}
      onMarkRemoval={(url) => setPending((list) => [...list, url])}
      onUndoRemoval={(url) => setPending((list) => list.filter((item) => item !== url))}
      maxImages={8}
    />
  );
}

/**
 * La papelera borraba el archivo en Cloudinary al instante, antes de guardar.
 * Ahora solo marca la foto y se puede deshacer; nada sale a la red.
 */
describe("ImageUpload with deferred removal", () => {
  afterEach(() => {
    cleanup();
    mocks.post.mockReset();
  });

  it("marks a photo for removal without calling Cloudinary and can undo it", () => {
    render(<Harness />);
    const trash = screen.getAllByRole("button", { name: "Quitar foto al guardar" });
    expect(trash).toHaveLength(2);

    fireEvent.click(trash[1]);
    expect(screen.getByText("Se quita al guardar")).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "Quitar foto al guardar" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.queryByText("Se quita al guardar")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Quitar foto al guardar" })).toHaveLength(2);
  });

  it("shows which photo is the main one and lets another take its place", () => {
    render(<Harness />);
    expect(screen.getByText("Principal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Usar como foto principal" }));
    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed).toHaveLength(1);
    expect(screen.getByText("Hasta 8 fotos, JPG, PNG o WebP.")).toBeInTheDocument();
  });
});
