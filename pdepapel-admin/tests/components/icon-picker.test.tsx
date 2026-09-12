// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_NOT_CONFIGURED_MESSAGE, IconPicker } from "@/components/ui/icon-picker";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    post: mocks.post,
    isAxiosError: (error: unknown) => typeof error === "object" && error !== null && "isAxiosError" in error,
  },
}));

const baseProps = {
  value: { icon: null, iconSvg: null },
  onChange: vi.fn(),
  name: "🎨 Creatividad",
  storeId: "store-1",
  aiConfigured: true,
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("IconPicker", () => {
  it("renders the 16 curated tiles with Spanish labels and the clean name in the preview", () => {
    render(<IconPicker {...baseProps} />);
    const grid = screen.getByTestId("icon-picker-curated");
    const tiles = within(grid).getAllByRole("button");
    expect(tiles).toHaveLength(16);
    expect(within(grid).getByText("Cuadernos")).toBeInTheDocument();
    expect(tiles.every((tile) => tile.getAttribute("aria-pressed") === "false")).toBe(true);
    // The preview strips the emoji: the name is stored clean.
    expect(within(screen.getByTestId("icon-picker-preview")).getByText("Creatividad")).toBeInTheDocument();
    expect(screen.queryByText("Quitar icono")).toBeNull();
  });

  it("selects a curated icon, clearing any custom SVG, and marks the tile as pressed", () => {
    const onChange = vi.fn();
    const { rerender } = render(<IconPicker {...baseProps} onChange={onChange} value={{ icon: null, iconSvg: '<path d="M1 1"/>' }} />);

    fireEvent.click(screen.getByRole("button", { name: "Lápices (pencil)" }));
    expect(onChange).toHaveBeenCalledWith({ icon: "pencil", iconSvg: null });

    rerender(<IconPicker {...baseProps} onChange={onChange} value={{ icon: "pencil", iconSvg: null }} />);
    expect(screen.getByRole("button", { name: "Lápices (pencil)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Lápices · pencil/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Quitar icono"));
    expect(onChange).toHaveBeenLastCalledWith({ icon: null, iconSvg: null });
  });

  it("searches in Spanish and shows icon tiles, not just names", async () => {
    vi.useFakeTimers();
    try {
      render(<IconPicker {...baseProps} />);
      fireEvent.change(screen.getByPlaceholderText("Buscar un icono (en español o inglés)…"), { target: { value: "tijeras" } });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      const results = screen.getByTestId("icon-picker-results");
      const first = within(results).getAllByRole("button")[0];
      expect(first).toHaveAttribute("aria-label", "scissors");
      expect(first.querySelector("svg, span")).not.toBeNull();

      fireEvent.change(screen.getByPlaceholderText("Buscar un icono (en español o inglés)…"), { target: { value: "zzzqqq" } });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByRole("status")).toHaveTextContent("Sin resultados para «zzzqqq»");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the AI card disabled when generation is not configured", () => {
    render(<IconPicker {...baseProps} aiConfigured={false} />);
    const card = screen.getByTestId("icon-picker-ai");
    expect(within(card).getByText(AI_NOT_CONFIGURED_MESSAGE)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Generar" })).toBeDisabled();
    expect(within(card).getByLabelText("Describe el icono")).toBeDisabled();
  });

  it("requests proposals, pages through them and applies one on demand", async () => {
    mocks.post.mockResolvedValue({ data: { proposals: ['<path d="M1 1 2 2"/>', '<circle cx="12" cy="12" r="4"/>'] } });
    const onChange = vi.fn();
    render(<IconPicker {...baseProps} onChange={onChange} />);

    const card = screen.getByTestId("icon-picker-ai");
    fireEvent.change(within(card).getByLabelText("Describe el icono"), { target: { value: "Clip con una hoja" } });
    fireEvent.click(within(card).getByRole("button", { name: "Generar" }));

    await waitFor(() => expect(within(card).getByText("Propuesta 1 de 2")).toBeInTheDocument());
    expect(mocks.post).toHaveBeenCalledWith("/api/store-1/types/icon-suggestions", { prompt: "Clip con una hoja", seed: undefined });
    expect(onChange).not.toHaveBeenCalled();
    expect(within(card).getByText("Se revisa antes de usarla; nunca se asigna sola.")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Otra" }));
    expect(within(card).getByText("Propuesta 2 de 2")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Usar este" }));
    expect(onChange).toHaveBeenCalledWith({ icon: null, iconSvg: '<circle cx="12" cy="12" r="4"/>' });
  });

  it("switches to the not-configured state when the API answers 503", async () => {
    mocks.post.mockRejectedValue({ isAxiosError: true, response: { status: 503, data: { message: "no" } } });
    render(<IconPicker {...baseProps} />);
    const card = screen.getByTestId("icon-picker-ai");
    fireEvent.change(within(card).getByLabelText("Describe el icono"), { target: { value: "Clip" } });
    fireEvent.click(within(card).getByRole("button", { name: "Generar" }));
    await waitFor(() => expect(within(card).getByText(AI_NOT_CONFIGURED_MESSAGE)).toBeInTheDocument());
    expect(within(card).getByRole("button", { name: "Generar" })).toBeDisabled();
  });
});
