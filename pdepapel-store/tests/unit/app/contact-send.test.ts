import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), fetch: vi.fn() }));

vi.mock("@/lib/env.mjs", () => ({
  env: { RESEND_API_KEY: "re_test", NEXT_PUBLIC_API_URL: "https://admin.test/api/store-1" },
}));
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
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ recipients: ["avisos@prueba.test"] })));
    vi.stubGlobal("fetch", mocks.fetch);
    process.env.REVALIDATION_SECRET = "secreto-de-prueba";
  });

  it("envía un mensaje bien formado a quien dice el panel", async () => {
    const response = await call(valido);

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://admin.test/api/store-1/notification-recipients",
      expect.objectContaining({ headers: { "x-revalidate-secret": "secreto-de-prueba" } }),
    );
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][0].to).toEqual(["avisos@prueba.test"]);
  });

  it("sin destinatarios desde el panel no envía y lo dice", async () => {
    mocks.fetch.mockResolvedValue(new Response("{}", { status: 403 }));
    const response = await call(valido);

    expect(response.status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sin el secreto no pregunta al panel ni envía", async () => {
    delete process.env.REVALIDATION_SECRET;
    const response = await call(valido);

    expect(response.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
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

  it("el señuelo sigue devolviendo éxito sin enviar ni registrar lo escrito", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await call({ ...valido, mobile: "3001234567" });

    expect(response.status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("laura@example.com");
    log.mockRestore();
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
