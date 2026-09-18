// @vitest-environment jsdom

import { VariantEditModal } from "@/components/modals/variant-edit-modal";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}));
vi.mock("@/components/editor/rich-text-editor", () => ({
  RichTextEditor: () => <div data-testid="editor" />,
}));
vi.mock("@/components/modals/intake-modal", () => ({
  IntakeModal: () => null,
}));

afterEach(cleanup);

/**
 * El esquema del modal no conocía gtin/mpn/«sin identificador»: al guardar
 * devolvía la fila sin ellos y el grupo dejaba la variante «sin
 * identificador», borrando un GTIN real.
 */
describe("VariantEditModal", () => {
  it("returns the identifiers it received when the form is submitted untouched", async () => {
    const onConfirm = vi.fn();
    render(
      <VariantEditModal
        isOpen
        onClose={vi.fn()}
        onConfirm={onConfirm}
        initialData={{
          id: "p1",
          sku: "CAR-ROS-1",
          name: "Cartuchera Rosa",
          price: 13000,
          acqPrice: 8000,
          stock: 2,
          gtin: "7701234567897",
          mpn: "MPN-1",
          hasNoProductIdentifier: false,
          images: [],
        }}
        suppliers={[]}
        groupImages={[]}
        sizes={[]}
        colors={[]}
        designs={[]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Guardar Cambios" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      id: "p1",
      gtin: "7701234567897",
      mpn: "MPN-1",
      hasNoProductIdentifier: false,
    });
  });
});
