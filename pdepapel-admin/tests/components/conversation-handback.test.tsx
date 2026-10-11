// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Devolver al bot» en la lista de conversaciones: una conversación esperando
 * a Paula se puede devolver aunque su pausa de 24 h ya venció (antes el
 * botón decía «El bot ya contesta» y quedaba apagado mientras el bot callaba).
 */
const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));

vi.mock("axios", () => ({ default: { post: mocks.post, patch: vi.fn(), isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { CellAction } from "@/app/(dashboard)/[storeId]/(routes)/conversaciones/components/cell-action";

const row = (overrides: Record<string, unknown>) =>
  ({
    id: "conv-1",
    phone: null,
    bsuid: "b-1",
    username: null,
    contactName: null,
    status: "OPEN",
    lastInboundAt: null,
    lastOutboundAt: null,
    lastOwnerAt: null,
    messageCount: 3,
    lastMessagePreview: null,
    lastMessageAt: null,
    ignored: false,
    ...overrides,
  }) as never;

const openMenu = () => fireEvent.pointerDown(screen.getByRole("button"), { button: 0, ctrlKey: false });
const DOS_DIAS = new Date(Date.now() - 48 * 3600 * 1000);

beforeEach(() => {
  mocks.post.mockResolvedValue({ data: { status: "OPEN", changed: true } });
  // Radix pide estas APIs del navegador al abrir el menú.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Devolver al bot", () => {
  it("esperando a Paula con la pausa vencida, se puede devolver y llama a la ruta", async () => {
    render(<CellAction data={row({ status: "NEEDS_OWNER", lastOwnerAt: DOS_DIAS })} />);
    openMenu();
    const item = await screen.findByRole("menuitem", { name: /Devolver al bot/ });
    expect(item).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/store-1/conversations/conv-1/handback"));
  });

  it("abierta y sin pausa, no hay nada que devolver", async () => {
    render(<CellAction data={row({ status: "OPEN", lastOwnerAt: DOS_DIAS })} />);
    openMenu();
    expect(await screen.findByRole("menuitem", { name: /El bot ya contesta/ })).toHaveAttribute("aria-disabled", "true");
  });
});
