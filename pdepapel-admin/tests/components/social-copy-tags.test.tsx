// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ put: vi.fn(async () => ({ data: {} })), toast: vi.fn() }));
vi.mock("axios", () => ({ default: { put: mocks.put, post: vi.fn(), delete: vi.fn(), isAxiosError: () => false } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { PostPieceSection } from "@/app/(dashboard)/[storeId]/(routes)/redes/components/post-piece-section";
import { PostTagEditor } from "@/app/(dashboard)/[storeId]/(routes)/redes/components/post-tag-editor";
import type { SocialPieceSummary, SocialPostSummary } from "@/lib/social/report";

/** «Copiar etiquetas de …»: una vez, solo agrega; el editor de al lado no pierde lo que no se ha guardado. */
const post = (id: string, platform: "INSTAGRAM" | "TIKTOK", tags: SocialPostSummary["tags"]) =>
  ({ id, platform, caption: id, postedAt: "2026-10-20T15:00:00.000Z", views: 100, multiplier: null, multiplierApprox: false, watchedPct: null, skipRate: null, tags, pieceId: "pieza-1", pieceSuggestions: [] }) as unknown as SocialPostSummary;
const instagram = post("ig", "INSTAGRAM", { FORMATO: ["kit"], GANCHO: [] });
const tiktok = post("tt", "TIKTOK", { FORMATO: ["Kit", "tendencia"], GANCHO: ["POV"] });
const piece = { id: "pieza-1", posts: [instagram, tiktok] } as unknown as SocialPieceSummary;
const onChanged = vi.fn(async () => {});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("copiar etiquetas entre redes", () => {
  it("dice qué le falta a esta y al copiar guarda la unión, sin quitar ni duplicar", async () => {
    render(<PostPieceSection storeId="store-1" post={instagram} posts={[instagram, tiktok]} pieces={[piece]} onChanged={onChanged} />);
    expect(screen.getByText(/La de TikTok tiene 2 etiquetas que esta no: tendencia, POV\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copiar etiquetas de TikTok" }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith("/api/store-1/social/posts/ig/tags", { FORMATO: ["kit", "tendencia"], GANCHO: ["POV"] }));
    expect(onChanged).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Etiquetas copiadas de TikTok" });
  });

  it("sin nada que copiar no aparece el botón", () => {
    render(<PostPieceSection storeId="store-1" post={{ ...instagram, tags: tiktok.tags }} posts={[instagram, tiktok]} pieces={[piece]} onChanged={onChanged} />);
    expect(screen.queryByRole("button", { name: /Copiar etiquetas/ })).not.toBeInTheDocument();
  });

  it("el editor suma las copiadas y conserva lo que se marcó sin guardar", () => {
    const options = { FORMATO: ["kit", "ASMR", "tendencia"], GANCHO: ["POV"] };
    const view = render(<PostTagEditor storeId="store-1" postId="ig" initial={instagram.tags} options={options} onSaved={onChanged} />);
    const formato = screen.getByRole("group", { name: /^Formato/ });
    fireEvent.click(within(formato).getByRole("checkbox", { name: "ASMR" }));
    view.rerender(<PostTagEditor storeId="store-1" postId="ig" initial={{ FORMATO: ["kit", "tendencia"], GANCHO: ["POV"] }} options={options} onSaved={onChanged} />);
    for (const name of ["kit", "ASMR", "tendencia"]) expect(within(formato).getByRole("checkbox", { name })).toBeChecked();
    expect(within(screen.getByRole("group", { name: /^Gancho/ })).getByRole("checkbox", { name: "POV" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar etiquetas" })).toBeEnabled();
  });
});
