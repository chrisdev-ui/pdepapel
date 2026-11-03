/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";

import { isWhatsAppHref, whatsAppClickEvent, whatsAppPageType } from "@/lib/whatsapp-click-tracking";

const mount = (html: string) => {
  document.body.innerHTML = html;
  return document.body;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("whatsapp_click", () => {
  it("reconoce los enlaces de WhatsApp por el dominio, no por el número", () => {
    expect(isWhatsAppHref("https://wa.me/573000000000?text=hola")).toBe(true);
    expect(isWhatsAppHref("https://api.whatsapp.com/send?phone=57300")).toBe(true);
    expect(isWhatsAppHref("whatsapp://send?text=hola")).toBe(true);
    expect(isWhatsAppHref("https://papeleriapdepapel.com/contacto")).toBe(false);
    expect(isWhatsAppHref("https://evil.example/wa.me")).toBe(false);
    expect(isWhatsAppHref(null)).toBe(false);
  });

  it("toma el lugar de data-ui-source, del pie o de la página", () => {
    mount(`
      <div data-ui-source="checkout_city_not_found"><a id="a" href="https://wa.me/57300"><span id="icon">x</span></a></div>
      <footer><a id="b" href="https://wa.me/57300">WhatsApp</a></footer>
      <main><a id="c" href="https://wa.me/57300">Escríbenos</a></main>
    `);
    expect(whatsAppClickEvent(document.getElementById("icon"), "/finalizar-compra")).toEqual({ ui_source: "checkout_city_not_found", page_type: "checkout" });
    expect(whatsAppClickEvent(document.getElementById("b"), "/producto/cuaderno")).toEqual({ ui_source: "footer", page_type: "product" });
    expect(whatsAppClickEvent(document.getElementById("c"), "/pedido/abc-123")).toEqual({ ui_source: "page_order", page_type: "order" });
  });

  it("no cuenta otros enlaces ni los que ya mandaron el evento", () => {
    mount(`
      <a id="shop" href="/tienda">Tienda</a>
      <a id="float" href="https://wa.me/57300" data-whatsapp-tracked="1">Flotante</a>
    `);
    expect(whatsAppClickEvent(document.getElementById("shop"), "/")).toBeNull();
    expect(whatsAppClickEvent(document.getElementById("float"), "/")).toBeNull();
  });

  it("nunca manda la ruta: solo el tipo de página", () => {
    expect(whatsAppPageType("/pedido/7d1f0c2e-1111-2222-3333-444455556666")).toBe("order");
    expect(whatsAppPageType("/")).toBe("home");
    expect(whatsAppPageType("/algo-nuevo")).toBe("other");
  });
});
