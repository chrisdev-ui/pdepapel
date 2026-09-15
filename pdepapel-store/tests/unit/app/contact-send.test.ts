import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@/lib/env.mjs", () => ({ env: { RESEND_API_KEY: "re_test" } }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));
vi.mock("@/emails/contact-form", () => ({ ContactFormEmail: () => null }));

import { POST } from "@/app/api/send/route";

const call = (body: unknown) =>
  POST(
    new Request("https://tienda.test/api/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const valido = {
  name: "Laura",
  email: "laura@example.com",
  subject: "Hola",
  message: "Una pregunta",
};

describe("POST /api/send", () => {
  beforeEach(() => {
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  it("envía un mensaje bien formado", async () => {
    const response = await call(valido);

    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it("no manda correo con datos inválidos", async () => {
    const response = await call({ name: "", email: "no-es-correo" });

    expect(response.status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("corta un mensaje desmedido en vez de reenviarlo", async () => {
    // La ruta es pública y el correo sale del dominio de la tienda.
    const response = await call({ ...valido, message: "a".repeat(5000) });

    expect(response.status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("el señuelo sigue devolviendo éxito sin enviar nada", async () => {
    const response = await call({ ...valido, mobile: "3001234567" });

    expect(response.status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("un cuerpo que no es JSON no rompe la ruta", async () => {
    const response = await POST(
      new Request("https://tienda.test/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{roto",
      }),
    );

    expect(response.status).toBe(400);
  });
});
