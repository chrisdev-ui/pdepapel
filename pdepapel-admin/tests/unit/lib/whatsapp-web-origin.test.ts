import { describe, expect, it } from "vitest";

import { detectWebOrigin } from "@/lib/whatsapp/web-origin";

/** Textos que la tienda escribe al abrir WhatsApp, editados o no, y lo que no debe pasar por ellos. */
describe("detectWebOrigin", () => {
  it("producto: nombre y referencia", () => {
    expect(detectWebOrigin("¡Hola! 👋 Vengo de la tienda web y me interesa: Cuaderno Argollado Norma 5 Materias (ref CUA-NOR-5MA-GR-X-0123).")).toEqual({
      source: "web",
      pageType: "product",
      legacy: false,
      refs: ["CUA-NOR-5MA-GR-X-0123"],
      orderNumber: null,
      extraText: null,
    });
  });

  it("carrito: varias referencias, con «y más»", () => {
    expect(detectWebOrigin("¡Hola! 👋 Vengo de la tienda web, tengo una duda con mi carrito (ref AAA-BBB-1, CCC-DDD-2 y más).")).toMatchObject({
      pageType: "cart",
      refs: ["AAA-BBB-1", "CCC-DDD-2"],
    });
    expect(detectWebOrigin("¡Hola! 👋 Vengo de la tienda web, tengo una duda con mi carrito.")).toMatchObject({ pageType: "cart", refs: [] });
  });

  it("pedido y general", () => {
    expect(detectWebOrigin("¡Hola! 👋 Tengo una pregunta sobre mi pedido #ORD-1791380325794-318 de la tienda web.")).toMatchObject({
      pageType: "order",
      orderNumber: "ORD-1791380325794-318",
    });
    expect(detectWebOrigin("¡Hola! 👋 Vengo de la tienda web y quiero hacer una consulta.")).toMatchObject({ pageType: "general", legacy: false });
  });

  it("los textos viejos también cuentan como web", () => {
    expect(detectWebOrigin("¡Hola! Encontré su contacto en la página web. Me gustaría consultar sobre…")).toMatchObject({ pageType: "general", legacy: true, extraText: null });
    expect(detectWebOrigin("¡Hola! Tengo una duda sobre mi pedido ORD-1791380325794-318.")).toMatchObject({
      pageType: "order",
      legacy: true,
      orderNumber: "ORD-1791380325794-318",
    });
  });

  it("lee lo que arma la tienda con un nombre recortado (pdepapel-store/lib/whatsapp-prefill.ts)", () => {
    expect(detectWebOrigin("¡Hola! 👋 Vengo de la tienda web y me interesa: Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set Set… (ref SET-AAA-BBB-CC-D-0001).")).toMatchObject({
      pageType: "product",
      refs: ["SET-AAA-BBB-CC-D-0001"],
      extraText: null,
    });
    expect(detectWebOrigin("¡Hola! 👋 Vengo de la tienda web, tengo una duda con mi carrito (ref A-1, B-2, C-3, D-4, E-5 y más).")).toMatchObject({
      pageType: "cart",
      refs: ["A-1", "B-2", "C-3", "D-4", "E-5"],
    });
  });

  it("aguanta tildes y emojis quitados", () => {
    expect(detectWebOrigin("hola vengo de la tienda web y me interesa: cuaderno (ref cua-nor-5ma-gr-x-0123)")).toMatchObject({
      pageType: "product",
      refs: ["CUA-NOR-5MA-GR-X-0123"],
    });
  });

  it("lo que escribe después es una pregunta de verdad", () => {
    expect(
      detectWebOrigin("¡Hola! 👋 Vengo de la tienda web y quiero hacer una consulta. ¿Hacen envíos a Pasto?")?.extraText,
    ).toBe("hacen envios a pasto?");
    expect(detectWebOrigin("¡Hola! Encontré su contacto en la página web. Me gustaría consultar sobre los colores Stabilo")?.extraText).toBe("los colores stabilo");
    expect(detectWebOrigin("¡Hola! 👋 Vengo de la tienda web y quiero hacer una consulta. 🙏")?.extraText).toBeNull();
  });

  it.each([
    "Vengo de la tienda física y quiero hacer una consulta",
    "Hola, ¿esto es de la tienda web?",
    "me interesa el cuaderno de la tienda web",
    "Vengo de la tienda web y me interesa: cuaderno (ref <script>)",
    "Tengo una pregunta sobre mi pedido de la tienda web",
    "Tengo una duda sobre mi pedido de ayer",
    "Escríbeme: vengo de la tienda web y quiero hacer una consulta",
    "",
  ])("no se confunde con «%s»", (text) => {
    expect(detectWebOrigin(text)).toBeNull();
  });
});
