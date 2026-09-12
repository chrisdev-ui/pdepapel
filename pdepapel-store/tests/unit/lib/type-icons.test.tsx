// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { resolveTypeIcon, resolveTypeIconSource, TypeIcon } from "@/lib/type-icons";

afterEach(cleanup);

describe("resolveTypeIconSource", () => {
  it("prefers a sanitised custom SVG over any Lucide name", () => {
    const source = resolveTypeIconSource({ icon: "gift", iconSvg: '<path d="M1 1 2 2"/>', name: "Regalos" });
    expect(source.kind).toBe("svg");
    if (source.kind === "svg") expect(source.elements).toEqual([{ tag: "path", attrs: { d: "M1 1 2 2" } }]);
  });

  it("ignores unsafe SVG and falls through to the Lucide name", () => {
    const source = resolveTypeIconSource({ icon: "gift", iconSvg: "<script>x</script>", name: "Regalos" });
    expect(source.kind).toBe("static");
    if (source.kind === "static") expect(source.Icon.displayName).toBe("Gift");
  });

  it("loads any other Lucide name on demand with the keyword icon as fallback", () => {
    const source = resolveTypeIconSource({ icon: "scissors", name: "Bolsos & Morrales" });
    expect(source.kind).toBe("dynamic");
    if (source.kind === "dynamic") {
      expect(source.name).toBe("scissors");
      expect(source.Fallback.displayName).toBe("Backpack");
    }
  });

  it("keeps the keyword fallback pixel-identical when no icon is stored", () => {
    const source = resolveTypeIconSource({ slug: "escritura", name: "🖊️ Escritura" });
    expect(source.kind).toBe("static");
    if (source.kind === "static") expect(source.Icon).toBe(resolveTypeIcon({ slug: "escritura", name: "🖊️ Escritura" }));
    expect(resolveTypeIconSource({ name: "Algo nuevo" })).toMatchObject({ kind: "static", Icon: expect.objectContaining({ displayName: "Tag" }) });
    expect(resolveTypeIconSource({ icon: "Not Valid!", name: "Algo nuevo" })).toMatchObject({ kind: "static" });
  });
});

describe("TypeIcon", () => {
  it("paints the custom SVG with the Lucide wrapper attributes", () => {
    const { container } = render(<TypeIcon type={{ iconSvg: '<circle cx="12" cy="12" r="4"/>', name: "Propio" }} className="h-4 w-4" />);
    const svg = container.querySelector('svg[data-type-icon="svg"]');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("stroke-width")).toBe("2");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.getAttribute("class")).toBe("h-4 w-4");
    expect(svg?.querySelector("circle")?.getAttribute("r")).toBe("4");
  });

  it("paints a bundled Lucide icon directly", () => {
    const { container } = render(<TypeIcon type={{ icon: "gift", name: "Regalos" }} className="h-4 w-4" />);
    expect(container.querySelector("svg.lucide-gift")).not.toBeNull();
  });

  it("paints the keyword fallback while a non-bundled Lucide name loads", () => {
    const { container } = render(<TypeIcon type={{ icon: "scissors", name: "Cuadernos" }} className="h-4 w-4" />);
    expect(container.querySelector("svg.lucide-notebook-pen")).not.toBeNull();
  });

  it("paints the keyword fallback when nothing is stored", () => {
    const { container } = render(<TypeIcon type={{ name: "Planeación & Organización" }} />);
    expect(container.querySelector("svg.lucide-calendar-days")).not.toBeNull();
  });
});
