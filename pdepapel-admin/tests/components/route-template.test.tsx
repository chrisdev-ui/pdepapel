import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Template from "@/app/(dashboard)/[storeId]/(routes)/template";

describe("admin route template", () => {
  it("paints the screen visible from the server, with no inline opacity waiting on hydration", () => {
    const html = renderToStaticMarkup(<Template>Pedidos</Template>);
    expect(html).toContain("Pedidos");
    expect(html).not.toMatch(/style=/);
    expect(html).not.toMatch(/opacity:\s*0/);
  });

  it("enters with a 0.15 s CSS animation that reduced motion turns off", () => {
    const html = renderToStaticMarkup(<Template>Productos</Template>);
    expect(html).toContain("animate-in");
    expect(html).toContain("duration-150");
    expect(html).toContain("motion-reduce:animate-none");
  });
});
