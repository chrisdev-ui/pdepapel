import { describe, expect, it } from "vitest";

import {
  DESCRIPTION_ISSUE_LABEL,
  inspectMercadoLibreDescription,
  type DescriptionIssueKind,
} from "@/lib/mercadolibre/description-rules";

const kinds = (text: string) => inspectMercadoLibreDescription(text).issues.map((issue) => issue.kind);

function expectIdempotent(text: string) {
  const first = inspectMercadoLibreDescription(text);
  const second = inspectMercadoLibreDescription(first.clean);
  expect(second.issues).toEqual([]);
  expect(second.clean).toBe(first.clean);
  return first;
}

describe("inspectMercadoLibreDescription", () => {
  it("no toca medidas, cantidades, años ni símbolos permitidos", () => {
    const text =
      "Cuaderno argollado 21 x 29,7 cm, x36 lápices, 1.200 hojas, edición 2026, 10 colores.\n" +
      "• Diseño «niña» con ñandú © ® ™\n- Ref. 15 cm\nTe quiero <3 y a < b";
    const result = inspectMercadoLibreDescription(text);
    expect(result.issues).toEqual([]);
    expect(result.clean).toBe(text);
  });

  it("quita HTML, decodifica entidades y conserva los saltos de bloque", () => {
    const result = expectIdempotent("<p>Hola <b>linda</b>&nbsp;agenda &amp; stickers</p><p>Con &copy; y &ntilde;</p>");
    expect(result.clean).toBe("Hola linda agenda & stickers\n\nCon © y ñ");
    expect(result.issues.every((issue) => issue.kind === "html")).toBe(true);
    expect(result.issues.map((issue) => issue.sample)).toEqual(
      expect.arrayContaining(["<b>", "</b>", "&nbsp;", "&amp;", "&copy;"]),
    );
  });

  it("decodifica entidades dobles sin dejar restos", () => {
    const result = expectIdempotent("Tinta &amp;amp; papel &amp;lt;b&amp;gt;");
    expect(result.clean).toBe("Tinta & papel");
  });

  it("quita emojis, banderas, selectores y uniones de emoji", () => {
    const result = expectIdempotent("Lindo 😍 cuaderno ✨\n🇨🇴 Hecho en Colombia ❤️ 👩‍🎨");
    expect(result.clean).toBe("Lindo cuaderno\nHecho en Colombia");
    expect(kinds("Lindo 😍")).toEqual(["emoji"]);
  });

  it("quita la oración entera con frases de contacto", () => {
    const result = expectIdempotent("Agenda kawaii. Escríbenos al WhatsApp 3001112233 para más. Tamaño carta.");
    expect(result.clean).toBe("Agenda kawaii. Tamaño carta.");
    expect(result.issues).toEqual([{ kind: "contact-phrase", sample: "Escríbenos" }]);
  });

  it.each(["Llámanos hoy.", "Síguenos en redes.", "Visita nuestra tienda.", "Encuéntranos en Instagram.", "Por whatsapp."])(
    "reconoce «%s» como contacto",
    (sentence) => {
      const result = expectIdempotent(`Cuaderno rayado. ${sentence}`);
      expect(result.clean).toBe("Cuaderno rayado.");
      expect(kinds(sentence)).toEqual(["contact-phrase"]);
    },
  );

  it("quita enlaces, dominios sueltos, correos y usuarios", () => {
    const result = expectIdempotent(
      "Visita papeleriapdepapel.com o https://bit.ly/abc. Correo hola@pdepapel.com, sigue @pdepapel. Más en www.ejemplo.co/x y wa.me/573001112233",
    );
    expect(result.clean).not.toMatch(/papeleriapdepapel|bit\.ly|@|www|wa\.me/);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { kind: "url", sample: "papeleriapdepapel.com" },
        { kind: "url", sample: "https://bit.ly/abc" },
        { kind: "url", sample: "www.ejemplo.co/x" },
        { kind: "url", sample: "wa.me/573001112233" },
        { kind: "email", sample: "hola@pdepapel.com" },
        { kind: "handle", sample: "@pdepapel" },
      ]),
    );
  });

  it.each(["3001112233", "300 111 2233", "300-111-2233", "+57 300 111 2233", "+573001112233", "(604) 444 5566", "6044445566"])(
    "quita el teléfono %s",
    (phone) => {
      const result = expectIdempotent(`Pedidos al ${phone} hoy`);
      expect(result.clean).toBe("Pedidos al hoy");
      expect(result.issues).toEqual([{ kind: "phone", sample: phone }]);
    },
  );

  it("normaliza líneas en blanco y espacios finales", () => {
    const result = expectIdempotent("Línea uno   \n\n\n\n\nLínea dos\t\n");
    expect(result.clean).toBe("Línea uno\n\nLínea dos");
    expect(result.issues).toEqual([]);
  });

  it("descarta líneas que solo quedan con la viñeta", () => {
    const result = expectIdempotent("• Medida: 15 cm\n- wa.me/573001112233\n- Incluye 2 piezas");
    expect(result.clean).toBe("• Medida: 15 cm\n\n- Incluye 2 piezas");
  });

  it("es determinista e idempotente con texto mezclado", () => {
    const text = "<div>Kit 😍 &amp; más</div>Escríbenos. Ver papeleriapdepapel.com.\r\n\r\n\r\n\r\nFin";
    expect(inspectMercadoLibreDescription(text)).toEqual(inspectMercadoLibreDescription(text));
    expectIdempotent(text);
  });

  it("tiene etiqueta para cada tipo", () => {
    const all: DescriptionIssueKind[] = ["url", "email", "phone", "handle", "contact-phrase", "html", "emoji"];
    for (const kind of all) expect(DESCRIPTION_ISSUE_LABEL[kind]).toMatch(/\S/);
  });
});
