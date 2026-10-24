// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ put: vi.fn(async () => ({ data: {} })), toast: vi.fn() }));
vi.mock("axios", () => ({ default: { put: mocks.put, get: vi.fn(() => new Promise(() => {})), isAxiosError: () => false } }));
vi.mock("recharts", () => {
  const Empty = () => null;
  return { CartesianGrid: Empty, Line: Empty, LineChart: Empty, ResponsiveContainer: Empty, Tooltip: Empty, XAxis: Empty, YAxis: Empty };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { PostCurveDialog } from "@/app/(dashboard)/[storeId]/(routes)/redes/components/post-curve-dialog";
import { PostDurationField } from "@/app/(dashboard)/[storeId]/(routes)/redes/components/post-duration-field";
import { PostPromotionSection } from "@/app/(dashboard)/[storeId]/(routes)/redes/components/post-promotion-section";
import type { SocialPostSummary } from "@/lib/social/report";

/** «¿Se promocionó?» y la duración a mano: la dueña decide; la sugerencia solo pregunta. */
const base = { id: "post-1", platform: "INSTAGRAM", views: 319, totalViews: 3633, promotion: null, promotionSource: null, promotionSuggested: true, durationManualSec: null } as unknown as SocialPostSummary;
const onChanged = vi.fn(async () => {});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("¿Se promocionó?", () => {
  it("la sugerencia muestra totales y orgánicas; «Sí, se promocionó» guarda PROMOTED y vuelve a leer", async () => {
    render(<PostPromotionSection storeId="store-1" post={base} onChanged={onChanged} />);
    const region = screen.getByRole("region", { name: "¿Se promocionó?" });
    expect(within(region).getByText(/Instagram cuenta 3\.633 vistas en total y 319 orgánicas/)).toBeInTheDocument();
    expect(within(region).getByRole("switch", { name: "Promocionado" })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(within(region).getByRole("button", { name: "Sí, se promocionó" }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith("/api/store-1/social/posts/post-1/promotion", { promotion: "PROMOTED" }));
    expect(onChanged).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Marcada como promocionada" });
  });

  it("promocionada: el interruptor está encendido, explica que sale de las comparaciones y apagarlo la deja orgánica", async () => {
    render(<PostPromotionSection storeId="store-1" post={{ ...base, promotion: "PROMOTED", promotionSource: "AUTO", promotionSuggested: false }} onChanged={onChanged} />);
    expect(screen.queryByRole("button", { name: "Sí, se promocionó" })).not.toBeInTheDocument();
    expect(screen.getByText(/La marcó Instagram: tiene un anuncio activo/)).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "Promocionado" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith("/api/store-1/social/posts/post-1/promotion", { promotion: "NOT_PROMOTED" }));
  });

  it("duración a mano: se escribe con coma o punto, se valida y se puede borrar", async () => {
    const { rerender } = render(<PostDurationField storeId="store-1" post={base} onChanged={onChanged} />);
    const input = screen.getByLabelText("Duración (s)");
    const button = screen.getByRole("button", { name: "Guardar duración" });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "0" } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "22,5" } });
    fireEvent.click(button);
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith("/api/store-1/social/posts/post-1/duration", { seconds: 22.5 }));
    rerender(<PostDurationField storeId="store-1" post={{ ...base, durationManualSec: 22.5 }} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(mocks.put).toHaveBeenLastCalledWith("/api/store-1/social/posts/post-1/duration", { seconds: null }));
  });
});

describe("el detalle con la duración a mano", () => {
  it("después de guardar sigue habiendo un solo campo (la duración y las etiquetas no comparten llave)", () => {
    const reel = { ...base, productType: "REELS", caption: "Reel", tags: { FORMATO: [], GANCHO: [] }, pieceSuggestions: [], retentionReasons: [], durationUnavailable: true, durationSec: null, durationIsManual: false, promotionSuggested: false } as unknown as SocialPostSummary;
    const props = { storeId: "store-1", tagOptions: { FORMATO: [], GANCHO: [] }, pieces: [], onClose: () => {}, onChanged };
    const view = render(<PostCurveDialog {...props} posts={[reel]} post={reel} />);
    expect(screen.getAllByLabelText("Duración (s)")).toHaveLength(1);
    const saved = { ...reel, durationManualSec: 25, durationSec: 25, durationIsManual: true } as SocialPostSummary;
    view.rerender(<PostCurveDialog {...props} posts={[saved]} post={saved} />);
    expect(screen.getAllByLabelText("Duración (s)")).toHaveLength(1);
    expect(screen.getByText("25 s (a mano)")).toBeInTheDocument();
  });
});
