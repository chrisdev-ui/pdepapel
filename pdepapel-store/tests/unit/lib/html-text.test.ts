import { describe, expect, it } from "vitest";

import { stripHtmlTags } from "@/lib/html-text";
import { richTextToPlainText, sanitizeRichTextHtml } from "@/lib/rich-text";

describe("stripHtmlTags", () => {
  it("deja el texto de un HTML ya saneado, con los bloques separados por espacio", () => {
    expect(stripHtmlTags("<h2>✨ Agenda</h2><p>Con <strong>estilo</strong>.<br>Y color.</p>")).toBe(
      "✨ Agenda Con estilo. Y color.",
    );
  });

  /**
   * Las etiquetas de línea no separan palabras. La ficha de las carpetas
   * plásticas publicaba «con caucho , ideal» por cambiar </strong> por espacio.
   */
  it("no mete espacios donde había una etiqueta de línea", () => {
    expect(stripHtmlTags("<p>Carpeta en formato <strong>sobre con caucho</strong>, ideal para oficio.</p>")).toBe(
      "Carpeta en formato sobre con caucho, ideal para oficio.",
    );
    expect(stripHtmlTags('<p>Marca <a href="/x">Klipp</a>. <em>Nuevo</em>!</p>')).toBe("Marca Klipp. Nuevo!");
    // Los bloques sí separan.
    expect(stripHtmlTags("<ul><li>Uno</li><li>Dos</li></ul>")).toBe("Uno Dos");
  });

  it("decodifica las mismas entidades que el texto plano de siempre", () => {
    expect(stripHtmlTags("<p>Ana&nbsp;&amp;&nbsp;Bea &quot;ok&quot; &#39;si&#39;</p>")).toBe(
      "Ana & Bea \"ok\" 'si'",
    );
  });

  it("con nada, o solo etiquetas, devuelve vacío", () => {
    expect(stripHtmlTags(null)).toBe("");
    expect(stripHtmlTags("<p></p><ul><li></li></ul>")).toBe("");
  });

  /**
   * `richTextToPlainText` = sanear + esto. Si los dos se separan, la ficha
   * decidiría «sin descripción» con una regla distinta a la de los metadatos.
   */
  it("es exactamente lo que richTextToPlainText hace después de sanear", () => {
    const html = '<h1>Título</h1><p style="color:#DB2777">Hola <em>mundo</em></p><script>x()</script>';
    expect(richTextToPlainText(html)).toBe(stripHtmlTags(sanitizeRichTextHtml(html)));
  });
});
