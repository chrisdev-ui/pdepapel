// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** El chat y la página de conocimiento del copiloto, con el modelo y la red simulados. */
const mocks = vi.hoisted(() => ({
  chat: {
    messages: [] as unknown[],
    status: "ready" as string,
    error: undefined as Error | undefined,
    sendMessage: vi.fn(),
    stop: vi.fn(),
    regenerate: vi.fn(),
    setMessages: vi.fn(),
  },
  axios: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toast: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({ useChat: () => mocks.chat }));
vi.mock("axios", () => ({ default: { ...mocks.axios, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

import { CopilotChat } from "@/app/(dashboard)/[storeId]/(routes)/copiloto/components/copilot-chat";
import { KnowledgeList } from "@/app/(dashboard)/[storeId]/(routes)/copiloto/conocimiento/components/knowledge-list";

beforeEach(() => {
  // jsdom no dibuja: el desplazamiento al último mensaje no existe ahí.
  Element.prototype.scrollIntoView = vi.fn();
  mocks.chat.messages = [];
  mocks.chat.status = "ready";
  mocks.chat.error = undefined;
  Object.values(mocks.axios).forEach((fn) => fn.mockReset());
  mocks.axios.post.mockResolvedValue({ data: {} });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const answer = {
  id: "cop-1",
  role: "assistant",
  parts: [
    { type: "tool-resumenDeHoy", state: "output-available", output: { fuente: "resumenDeHoy", rango: "2026-10-10" } },
    { type: "text", text: "Llevas **$45.000** hoy [conocimiento: marcadores-acrilicos]." },
  ],
};

describe("CopilotChat", () => {
  it("sin mensajes muestra las sugerencias de la pantalla y las manda al tocarlas", () => {
    render(<CopilotChat storeId="store-1" screen="mercadolibre" conversations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "¿Hay alertas en Mercado Libre?" }));
    expect(mocks.chat.sendMessage).toHaveBeenCalledWith({ text: "¿Hay alertas en Mercado Libre?" });
  });

  it("muestra de dónde salen los datos, la negrita, el enlace a la nota y «Ver más»", () => {
    mocks.chat.messages = [{ id: "u1", role: "user", parts: [{ type: "text", text: "¿Cómo voy?" }] }, answer];
    render(<CopilotChat storeId="store-1" screen={null} conversations={[]} />);
    expect(screen.getByText(/Datos: .*2026-10-10/)).toBeInTheDocument();
    expect(screen.getByText("$45.000").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "nota: marcadores-acrilicos" })).toHaveAttribute("href", "/store-1/copiloto/conocimiento#marcadores-acrilicos");
    fireEvent.click(screen.getByRole("button", { name: "Ver más" }));
    expect(mocks.chat.sendMessage).toHaveBeenCalledWith({ text: "Ver más" });
  });

  it("mientras consulta dice qué está haciendo y deja detener", () => {
    mocks.chat.status = "streaming";
    mocks.chat.messages = [{ id: "c2", role: "assistant", parts: [{ type: "tool-porReponer", state: "input-available" }] }];
    render(<CopilotChat storeId="store-1" screen={null} conversations={[]} />);
    expect(screen.getByText("Calculando qué reponer…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detener" }));
    expect(mocks.chat.stop).toHaveBeenCalled();
  });

  it("un error del servidor se muestra en español y deja reintentar", () => {
    mocks.chat.error = new Error(JSON.stringify({ error: "Llegamos al presupuesto de hoy del copiloto. Mañana sigue." }));
    render(<CopilotChat storeId="store-1" screen={null} conversations={[]} />);
    expect(screen.getByText("Llegamos al presupuesto de hoy del copiloto. Mañana sigue.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.chat.regenerate).toHaveBeenCalled();
  });

  it("el pulgar abajo queda guardado", async () => {
    mocks.chat.messages = [answer];
    render(<CopilotChat storeId="store-1" screen={null} conversations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Mala respuesta" }));
    await waitFor(() => expect(mocks.axios.post).toHaveBeenCalledWith("/api/store-1/copiloto/mensajes/cop-1/valoracion", { value: "down" }));
  });

  it("abre una conversación anterior", async () => {
    mocks.axios.get.mockResolvedValue({ data: { messages: [answer] } });
    render(<CopilotChat storeId="store-1" screen={null} conversations={[{ id: "conv-1", title: "Ventas de ayer", lastMessageAt: "2026-10-09T00:00:00Z" }]} />);
    fireEvent.click(screen.getAllByText("Ventas de ayer").find((el) => el.tagName === "BUTTON")!);
    await waitFor(() => expect(mocks.chat.setMessages).toHaveBeenCalled());
    expect(mocks.axios.get).toHaveBeenCalledWith("/api/store-1/copiloto/conversaciones/conv-1");
  });
});

describe("KnowledgeList", () => {
  const note = { id: "adhesivos", titulo: "Adhesivos", tema: "journaling", body: "- **Doble faz:** no arruga.", approved: false, canApprove: true, pendingPaula: false };

  it("aprueba y corrige con la ruta de la nota", async () => {
    mocks.axios.post.mockResolvedValue({ data: { ...note, approved: true } });
    render(<KnowledgeList storeId="store-1" notes={[note]} />);
    expect(screen.getByText("Doble faz:").tagName).toBe("STRONG");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    await waitFor(() => expect(screen.getByText("Aprobada: el copiloto la usa")).toBeInTheDocument());
    expect(mocks.axios.post).toHaveBeenCalledWith("/api/store-1/copiloto/conocimiento/adhesivos");

    mocks.axios.put.mockResolvedValue({ data: { ...note, body: "Texto nuevo", approved: false } });
    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    fireEvent.change(screen.getByLabelText("Texto de la nota"), { target: { value: "Texto nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar texto" }));
    await waitFor(() => expect(mocks.axios.put).toHaveBeenCalledWith("/api/store-1/copiloto/conocimiento/adhesivos", { body: "Texto nuevo" }));
    await waitFor(() => expect(screen.getByText("Sin aprobar")).toBeInTheDocument());
  });

  it("una marca pendiente abre el editor y no se puede aprobar vacía", () => {
    render(<KnowledgeList storeId="store-1" notes={[{ ...note, id: "marca-kiut", titulo: "Marca Kiut", canApprove: false, pendingPaula: true }]} />);
    expect(screen.getByText("Pendiente de Paula")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar texto" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
  });
});
