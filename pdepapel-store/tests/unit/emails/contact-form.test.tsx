import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { ContactFormEmail, contactFormEmailText } from "@/emails/contact-form";

const props = { name: "Luisa", email: "luisa@prueba.test", subject: "Duda", message: "¿Tienen libretas A5?" };

describe("correo del formulario de contacto", () => {
  it("lleva la piel del panel y su texto plano con todo lo que escribió", async () => {
    const html = await render(ContactFormEmail(props));
    expect(html).toContain("Panel · formulario de contacto");
    const text = contactFormEmailText(props);
    expect(text).toContain("Nombre: Luisa");
    expect(text).toContain("Correo: luisa@prueba.test");
    expect(text).toContain("Asunto: Duda");
    expect(text).toContain("¿Tienen libretas A5?");
    expect(text).toContain("Responder: mailto:luisa@prueba.test");
  });

  it("sin asunto ni mensaje no deja líneas vacías de más", () => {
    expect(contactFormEmailText({ name: "Ana", email: "ana@prueba.test" })).toBe(
      "Alguien escribió desde la tienda.\n\nNombre: Ana\nCorreo: ana@prueba.test\n\n(sin mensaje)\n\nResponder: mailto:ana@prueba.test",
    );
  });
});
