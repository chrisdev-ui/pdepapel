import { describe, expect, it } from "vitest";

import {
  ICON_SVG_MAX_LENGTH,
  isSafeIconSvg,
  parseIconSvgElements,
  sanitizeIconSvg,
  serializeIconSvgElements,
} from "@/lib/svg-icon";

/** El icono `paperclip` de Lucide, tal como lo devolvería el modelo. */
const PAPERCLIP =
  '<path d="m21 11.5-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>';
const WRAPPED = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10" />
  <line x1="12" y1="8" x2="12" y2="16"></line>
  <rect x="3" y="3" width="18" height="18" rx="2" />
  <polyline points="4 12 9 17 20 6" />
  <ellipse cx="12" cy="12" rx="8" ry="4"/>
  <polygon points="12 2 22 22 2 22"/>
</svg>`;

describe("parseIconSvgElements", () => {
  it("accepts a Lucide-style set of elements and returns a typed list", () => {
    const elements = parseIconSvgElements(WRAPPED);
    expect(elements.map((element) => element.tag)).toEqual(["circle", "line", "rect", "polyline", "ellipse", "polygon"]);
    expect(elements[0]).toEqual({ tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } });
    expect(elements[2].attrs).toEqual({ x: "3", y: "3", width: "18", height: "18", rx: "2" });
  });

  it("parses bare inner markup without an <svg> wrapper", () => {
    expect(parseIconSvgElements(PAPERCLIP)).toEqual([
      { tag: "path", attrs: { d: "m21 11.5-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" } },
    ]);
  });

  it("rejects scripts, event handlers, links, url() references, styles, images and foreignObject", () => {
    const attacks = [
      `${PAPERCLIP}<script>alert(1)</script>`,
      '<path d="M1 1" onload="alert(1)"/>',
      '<path d="M1 1" href="javascript:alert(1)"/>',
      '<path d="M1 1" fill="url(#x)"/>',
      `<style>path{fill:red}</style>${PAPERCLIP}`,
      '<image href="https://x/y.png"/>',
      `<foreignObject><div>x</div></foreignObject>${PAPERCLIP}`,
      `<!-- comment -->${PAPERCLIP}`,
      `<text x="1" y="1">hola</text>`,
      `<path d="M1 1" transform="rotate(45)"/>`,
      `<g>${PAPERCLIP}</g>`,
      "texto suelto",
      `<path d="M1 1"/> suelto`,
      '<path d="M1 1" points=unquoted/>',
    ];
    for (const attack of attacks) {
      expect(parseIconSvgElements(attack), attack).toEqual([]);
      expect(isSafeIconSvg(attack), attack).toBe(false);
    }
  });

  it("rejects values outside the safe character set, missing required attributes and oversize input", () => {
    expect(parseIconSvgElements('<path d="M1 1&quot;"/>')).toEqual([]);
    expect(parseIconSvgElements('<circle cx="12" cy="12"/>')).toEqual([]);
    expect(parseIconSvgElements("")).toEqual([]);
    expect(parseIconSvgElements(null)).toEqual([]);
    expect(parseIconSvgElements(`<path d="${"M1 1 ".repeat(1000)}"/>`.slice(0, ICON_SVG_MAX_LENGTH + 10))).toEqual([]);
  });

  it("requires balanced closing tags", () => {
    expect(parseIconSvgElements('<line x1="1" y1="1" x2="2" y2="2">')).toEqual([]);
    expect(parseIconSvgElements('<line x1="1" y1="1" x2="2" y2="2"></circle>')).toEqual([]);
  });
});

describe("sanitizeIconSvg", () => {
  it("strips presentation attributes and the wrapper, keeping only the allowed geometry", () => {
    const safe = sanitizeIconSvg('<svg viewBox="0 0 24 24"><path stroke="red" fill="blue" stroke-width="4" class="x" d="M1 1 2 2" /></svg>');
    expect(safe).toBe('<path d="M1 1 2 2"/>');
    expect(safe).not.toMatch(/stroke|fill|svg|class/);
  });

  it("returns null for unsafe or empty markup and a canonical string otherwise", () => {
    expect(sanitizeIconSvg("<script>x</script>")).toBeNull();
    expect(sanitizeIconSvg("   ")).toBeNull();
    const canonical = sanitizeIconSvg(WRAPPED);
    expect(canonical).toContain('<circle cx="12" cy="12" r="10"/>');
    expect(canonical).toContain('<line x1="12" y1="12" x2="12" y2="16"/>'.replace('y1="12"', 'y1="8"'));
    // Idempotent: sanitising the output again gives the same string.
    expect(sanitizeIconSvg(canonical)).toBe(canonical);
  });

  it("round-trips through the serializer", () => {
    const elements = parseIconSvgElements(PAPERCLIP);
    expect(serializeIconSvgElements(elements)).toBe(sanitizeIconSvg(PAPERCLIP));
  });
});
