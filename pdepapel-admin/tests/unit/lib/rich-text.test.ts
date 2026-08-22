import {
  createPlainTextRichTextHtml,
  createRichTextExcerpt,
  normalizeRichTextLink,
  richTextToPlainText,
  sanitizeRichTextHtml,
} from "@/lib/rich-text";
import { describe, expect, it } from "vitest";

describe("rich text helpers", () => {
  it("removes unsafe HTML while preserving approved formatting", () => {
    const content =
      '<h1 style="color:#DB2777;font-size:99px">Título</h1><p style="color:#047857;text-align:center">Hola <strong>mundo</strong></p><img src=x onerror="alert(1)"><script>alert(1)</script>';

    const sanitized = sanitizeRichTextHtml(content);

    expect(sanitized).toContain("<h2");
    expect(sanitized).toMatch(/color:\s*#DB2777/);
    expect(sanitized).toMatch(/color:\s*#047857;\s*text-align:\s*center/);
    expect(sanitized).toContain("<strong>mundo</strong>");
    expect(sanitized).not.toContain("<h1");
    expect(sanitized).not.toContain("font-size");
    expect(sanitized).not.toContain("<img");
    expect(sanitized).not.toContain("script");
    expect(sanitized).not.toContain("onerror");
  });

  it("allows only safe links and secures external destinations", () => {
    const content =
      '<p><a href="https://example.com">Externo</a> <a href="/categoria/agendas">Interno</a> <a href="javascript:alert(1)">Inseguro</a></p>';

    const sanitized = sanitizeRichTextHtml(content);

    expect(sanitized).toContain(
      '<a href="https://example.com/" target="_blank" rel="noopener noreferrer">Externo</a>',
    );
    expect(sanitized).toContain('<a href="/categoria/agendas">Interno</a>');
    expect(sanitized).not.toContain("javascript:");
  });

  it("returns normalized plain text and a metadata-safe excerpt", () => {
    const content =
      "<h2>✨ Agenda kawaii</h2><p>Organiza tus ideas con estilo y mucho color.</p>";

    expect(richTextToPlainText(content)).toBe(
      "✨ Agenda kawaii Organiza tus ideas con estilo y mucho color.",
    );
    expect(createRichTextExcerpt(content, "Respaldo", 32)).toBe(
      "✨ Agenda kawaii Organiza tus…",
    );
  });

  it("converts an AI plain-text draft into safe rich-text paragraphs", () => {
    expect(
      createPlainTextRichTextHtml(
        "Portada con flores <script>alert(1)</script>\n\nFormato A5.",
      ),
    ).toBe(
      "<p>Portada con flores &lt;script&gt;alert(1)&lt;/script&gt;</p><p>Formato A5.</p>",
    );
  });

  it("validates internal, external and email links", () => {
    expect(normalizeRichTextLink("/producto/agenda-kawaii")).toBe(
      "/producto/agenda-kawaii",
    );
    expect(normalizeRichTextLink("mailto:hola@pdepapel.com")).toBe(
      "mailto:hola@pdepapel.com",
    );
    expect(normalizeRichTextLink("https://pdepapel.com/tienda")).toBe(
      "https://pdepapel.com/tienda",
    );
    expect(normalizeRichTextLink("javascript:alert(1)")).toBeNull();
  });
});
