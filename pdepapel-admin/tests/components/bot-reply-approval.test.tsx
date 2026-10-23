// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * «Aprobar menú» cambia solo la aprobación: no refresca la página. Antes
 * llamaba a `router.refresh()`, que remontaba el formulario y borraba el
 * texto escrito sin guardar. (En e2e la aprobación no se puede probar: el
 * aislamiento de pruebas fija un aprobador ficticio.)
 */
const mocks = vi.hoisted(() => ({
  post: vi.fn(async () => ({ data: {} })),
  delete: vi.fn(async () => ({ data: {} })),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("axios", () => ({ default: { post: mocks.post, delete: mocks.delete, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }), useParams: () => ({ storeId: "store-1" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { BotReplyForm } from "@/app/(dashboard)/[storeId]/(routes)/conversaciones/respuestas/[botReplyId]/components/bot-reply-form";

const reply = {
  id: "reply-1",
  label: "Menú de kits",
  triggers: ["kits"],
  answer: "Respuesta guardada",
  isActive: true,
  sortOrder: 0,
  buttons: [{ title: "Ver más", targetReplyId: "reply-2" }],
  approvedAt: null,
  approvedBy: null,
  updatedAt: new Date("2026-10-23T12:00:00Z"),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("aprobar un menú del bot", () => {
  it("aprueba sin refrescar la página y conserva el texto sin guardar", async () => {
    render(<BotReplyForm initialData={reply} targets={[{ id: "reply-2", label: "Destino" }]} canApprove storeId="store-1" />);
    const answer = screen.getByLabelText("Respuesta");
    fireEvent.change(answer, { target: { value: "Texto nuevo sin guardar" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar menú" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/store-1/bot-replies/reply-1/approve"));
    expect(await screen.findByRole("button", { name: "Retirar aprobación" })).toBeTruthy();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Respuesta") as HTMLTextAreaElement).value).toBe("Texto nuevo sin guardar");
  });
});
