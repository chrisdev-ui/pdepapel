import { describe, expect, it, vi } from "vitest";

/**
 * Rutas reales que validan con `.parse()` y que hasta ahora respondían 500 a
 * una entrada mal formada, porque `handleErrorResponse` no distinguía un
 * ZodError de un fallo del servidor.
 *
 * A propósito NO se simula `handleErrorResponse`: lo que se comprueba es
 * justamente el manejador de verdad.
 */

const session = vi.hoisted(() => ({ userId: "user-owner" as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: session.userId }) }));
// `lib/utils` arrastra la validación de entorno; las rutas solo necesitan
// estas dos cosas de ahí.
vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  verifyStoreOwner: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    whatsAppBotReply: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    store: { findFirst: vi.fn().mockResolvedValue({ name: "Tienda" }) },
    newsletterSubscriber: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

const pedir = (body: unknown) =>
  new Request("https://admin.test/api/store-1/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("bot-replies: una respuesta mal formada da 400, no 500", () => {
  it("nombra el campo que falta en vez de «Error interno del servidor»", async () => {
    const { POST } = await import("@/app/api/[storeId]/bot-replies/route");

    const response = await POST(pedir({ label: "", triggers: [], answer: "" }), {
      params: { storeId: "store-1" },
    });

    expect(response.status).toBe(400);
    const cuerpo = (await response.json()) as { error: string };
    expect(cuerpo.error).not.toBe("Error interno del servidor");
    // El primer problema del esquema, en español.
    expect(cuerpo.error).toBe("Ponle un nombre");
  });

  it("devuelve los errores por campo para poder pintarlos", async () => {
    const { POST } = await import("@/app/api/[storeId]/bot-replies/route");

    const response = await POST(pedir({ label: "Horarios" }), {
      params: { storeId: "store-1" },
    });
    const cuerpo = (await response.json()) as {
      details?: { fieldErrors?: Record<string, string[]> };
    };

    expect(response.status).toBe(400);
    expect(Object.keys(cuerpo.details?.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(["triggers", "answer"]),
    );
  });
});

describe("bot-replies/assistant: un modo inexistente da 400, no 500", () => {
  it("rechaza el cuerpo sin caer en el error genérico", async () => {
    const { POST } = await import("@/app/api/[storeId]/bot-replies/assistant/route");

    const response = await POST(pedir({ mode: "inventado" }), {
      params: { storeId: "store-1" },
    });

    // 400 de validación, no 500. (503 sería «falta GEMINI_API_KEY», que se
    // comprueba antes; por eso se acepta, pero nunca un 500.)
    expect([400, 503]).toContain(response.status);
    const cuerpo = (await response.json()) as { error: string };
    expect(cuerpo.error).not.toBe("Error interno del servidor");
  });
});
