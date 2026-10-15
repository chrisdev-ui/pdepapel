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
  },
  chatOptions: [] as { id: string; messages: unknown[] }[],
  axios: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toast: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: (options: { id: string; messages: unknown[] }) => {
    mocks.chatOptions.push(options);
    return mocks.chat;
  },
}));
vi.mock("axios", () => ({ default: { ...mocks.axios, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

import { AssistantText, CopilotChat } from "@/app/(dashboard)/[storeId]/(routes)/copiloto/components/copilot-chat";
import { KnowledgeList } from "@/app/(dashboard)/[storeId]/(routes)/copiloto/conocimiento/components/knowledge-list";

beforeEach(() => {
  // jsdom no dibuja: el desplazamiento al último mensaje no existe ahí.
  Element.prototype.scrollIntoView = vi.fn();
  mocks.chat.messages = [];
  mocks.chat.status = "ready";
  mocks.chat.error = undefined;
  mocks.chatOptions.length = 0;
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
  it("sin botón de «Modo Marketing»: las habilidades se ven como chips y se pueden quitar", async () => {
    mocks.chat.messages = [
      { id: "u-1", role: "user", parts: [{ type: "text", text: "Mejora la ficha" }] },
      {
        id: "cop-1",
        role: "assistant",
        parts: [
          { type: "tool-cargarHabilidad", state: "output-available", output: { ok: true, id: "descripciones" } },
          { type: "text", text: "Listo." },
        ],
      },
    ];
    mocks.axios.post.mockResolvedValue({ data: { loaded: [], pinned: [], blocked: ["descripciones"], modelChosen: ["descripciones"] } });
    render(<CopilotChat storeId="store-1" screen={null} conversations={[]} />);
    expect(screen.queryByRole("button", { name: "Modo Marketing" })).toBeNull();
    expect(screen.getByText("Usando: Descripciones")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dejar de usar Descripciones en esta conversación" }));
    await waitFor(() => expect(screen.queryByText("Usando: Descripciones")).toBeNull());
    expect(mocks.axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/copiloto\/conversaciones\/.+\/habilidades$/), { action: "remove", skillId: "descripciones" });
    // Nunca vuelve a responder solo: lo ofrece.
    expect(mocks.chat.regenerate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Responder de nuevo con estas habilidades" }));
    expect(mocks.chat.regenerate).toHaveBeenCalledTimes(1);
  });

  it("la fuente dice «la ficha del producto» solo si lo encontró", () => {
    mocks.chat.messages = [
      { id: "cop-3", role: "assistant", parts: [{ type: "tool-productoParaDescripcion", state: "output-available", output: { encontrado: true, datos: { sku: "MAR-1" } } }] },
      { id: "cop-4", role: "assistant", parts: [{ type: "tool-productoParaDescripcion", state: "output-available", output: { encontrado: false, candidatos: [] } }] },
    ];
    render(<CopilotChat storeId="store-1" screen={null} conversations={[]} />);
    expect(screen.getByText("Datos: la ficha del producto (SKU MAR-1)")).toBeInTheDocument();
    expect(screen.getByText("Datos: lo que me diste")).toBeInTheDocument();
  });

  it("«Copiar para la ficha» copia el HTML de la plantilla y el texto plano", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write, writeText: vi.fn() } });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      constructor(readonly items: Record<string, Blob>) {}
    };
    mocks.chat.messages = [
      {
        id: "cop-2",
        role: "assistant",
        parts: [{ type: "text", text: "**Nombre sugerido:** Set\n\n**Descripción para la ficha**\n¡Hola!\n- **Marca:** X.\n\n**SEO (solo referencia)**\n- Título: Set" }],
      },
    ];
    render(<CopilotChat storeId="store-1" screen={null} conversations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar para la ficha" }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const item = write.mock.calls[0][0][0] as { items: Record<string, Blob> };
    expect(await item.items["text/html"].text()).toBe("<h3>¡Hola!</h3><ul><li><strong>Marca:</strong> X.</li></ul>");
    expect(await item.items["text/plain"].text()).toBe("¡Hola!\n• Marca: X.");
  });

  it("sin mensajes muestra las sugerencias de la pantalla; tocar una la escribe en la caja sin mandarla", () => {
    render(<CopilotChat storeId="store-1" screen="mercadolibre/publicaciones" conversations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "¿Hay alertas en Mercado Libre?" }));
    expect(mocks.chat.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Tu pregunta")).toHaveValue("¿Hay alertas en Mercado Libre?");
    expect(screen.getByLabelText("Tu pregunta")).toHaveFocus();
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

  const history = [{ id: "conv-1", title: "Ventas de ayer", lastMessageAt: "2026-10-09T00:00:00Z" }];
  const lastChat = () => mocks.chatOptions[mocks.chatOptions.length - 1];

  it("abre una conversación anterior con un solo clic, con sus mensajes", async () => {
    mocks.axios.get.mockResolvedValue({ data: { messages: [answer] } });
    render(<CopilotChat storeId="store-1" screen={null} conversations={history} />);
    fireEvent.click(screen.getAllByText("Ventas de ayer").find((el) => el.tagName === "BUTTON")!);
    // El chat nuevo nace con el id y los mensajes juntos: sin segundo clic.
    await waitFor(() => expect(lastChat()).toMatchObject({ id: "conv-1", messages: [{ id: "cop-1", role: "assistant" }] }));
    expect(mocks.axios.get).toHaveBeenCalledTimes(1);
    expect(mocks.axios.get).toHaveBeenCalledWith("/api/store-1/copiloto/conversaciones/conv-1");
  });

  it("en el teléfono la abre al elegirla en la lista", async () => {
    mocks.axios.get.mockResolvedValue({ data: { messages: [answer] } });
    render(<CopilotChat storeId="store-1" screen={null} conversations={history} />);
    fireEvent.change(screen.getByLabelText("Conversaciones anteriores"), { target: { value: "conv-1" } });
    await waitFor(() => expect(lastChat()).toMatchObject({ id: "conv-1", messages: [{ id: "cop-1" }] }));
  });

  it("elimina una conversación tras confirmar y, si estaba abierta, vuelve a un chat vacío", async () => {
    mocks.axios.get.mockResolvedValue({ data: { messages: [answer] } });
    mocks.axios.delete.mockResolvedValue({ data: { deleted: true } });
    render(<CopilotChat storeId="store-1" screen={null} conversations={history} />);
    fireEvent.click(screen.getAllByText("Ventas de ayer").find((el) => el.tagName === "BUTTON")!);
    await waitFor(() => expect(lastChat().id).toBe("conv-1"));

    fireEvent.click(screen.getAllByRole("button", { name: "Eliminar la conversación «Ventas de ayer»" })[0]);
    expect(await screen.findByText("¿Eliminar esta conversación?")).toBeInTheDocument();
    expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(mocks.axios.delete).toHaveBeenCalledWith("/api/store-1/copiloto/conversaciones/conv-1"));
    await waitFor(() => expect(lastChat()).toMatchObject({ messages: [] }));
    expect(lastChat().id).not.toBe("conv-1");
    expect(screen.queryAllByText("Ventas de ayer").filter((el) => el.tagName === "BUTTON")).toHaveLength(0);
  });

  it("sin confirmar no borra nada", async () => {
    render(<CopilotChat storeId="store-1" screen={null} conversations={history} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Eliminar la conversación «Ventas de ayer»" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(mocks.axios.delete).not.toHaveBeenCalled();
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

  it("acepta notas largas, hasta 10.000 caracteres, y muestra cuánto lleva", () => {
    render(<KnowledgeList storeId="store-1" notes={[note]} />);
    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    const box = screen.getByLabelText("Texto de la nota");
    expect(box).toHaveAttribute("maxLength", "10000");
    fireEvent.change(box, { target: { value: "a".repeat(4781) } });
    expect(screen.getByText("4.781 de 10.000 caracteres")).toBeInTheDocument();
  });

  it("una marca pendiente abre el editor y no se puede aprobar vacía", () => {
    render(<KnowledgeList storeId="store-1" notes={[{ ...note, id: "marca-kiut", titulo: "Marca Kiut", canApprove: false, pendingPaula: true }]} />);
    expect(screen.getByText("Pendiente de Paula")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar texto" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
  });
});

describe("respuesta del copiloto con viñetas", () => {
  it("cada viñeta lleva su nivel por la sangría y el texto queda igual; la negrita y las notas siguen funcionando", () => {
    const text = ["Hay 2 lentos.", "", "- **Kit escolar** — útiles", "  - Libreta (lento): $9.000", "  - Por qué:", "    - Libreta: 120 días sin venderse [conocimiento: kits]"].join("\n");
    const { container } = render(<AssistantText text={text} storeId="store-1" />);
    const bullets = Array.from(container.querySelectorAll("[data-bullet-depth]"));
    expect(bullets.map((node) => [node.getAttribute("data-bullet-depth"), node.textContent])).toEqual([
      ["0", "• Kit escolar — útiles"],
      ["1", "• Libreta (lento): $9.000"],
      ["1", "• Por qué:"],
      ["2", "• Libreta: 120 días sin venderse nota: kits"],
    ]);
    expect((bullets[1] as HTMLElement).style.paddingLeft).toBe("2.1em");
    expect((bullets[1] as HTMLElement).style.textIndent).toBe("-1.1em");
    expect(container.querySelector("strong")?.textContent).toBe("Kit escolar");
    expect(screen.getByRole("link", { name: "nota: kits" }).getAttribute("href")).toBe("/store-1/copiloto/conocimiento#kits");
    expect(container.textContent).toContain("Hay 2 lentos.");
  });
});

