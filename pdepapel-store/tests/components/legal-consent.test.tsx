// @vitest-environment jsdom

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StepNavigation } from "@/app/(routes)/finalizar-compra/components/step-navigation";
import { LegalConsent } from "@/components/legal/legal-consent";

describe("autorización legal en el checkout", () => {
  afterEach(() => cleanup());

  it("dice la frase completa con los dos enlaces, que abren en otra pestaña", () => {
    render(<LegalConsent action="checkout" />);
    expect(screen.getByTestId("legal-consent")).toHaveTextContent(
      "Al finalizar tu compra aceptas los Términos y condiciones y autorizas el tratamiento de tus datos según la Política de privacidad.",
    );
    for (const [name, href] of [
      ["Términos y condiciones", "/politicas/terminos"],
      ["Política de privacidad", "/politicas/privacidad"],
    ]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("va antes del botón de pago, no en la letra pequeña de abajo", () => {
    render(<StepNavigation currentStep={3} totalSteps={3} onNext={() => {}} onBack={() => {}} submitLabel="Pagar $ 20.000" consent={<LegalConsent action="checkout" />} footnote="Pagas al recibir." />);
    const consent = screen.getByTestId("legal-consent");
    const button = screen.getByRole("button", { name: /Pagar/ });
    expect(consent.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.compareDocumentPosition(screen.getByText("Pagas al recibir.")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("precio final en el checkout y el carrito", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (file: string) => readFileSync(path.join(root, file), "utf8").replace(/\s+/g, " ");

  it("el total del checkout dice que el precio es final, y la autorización va en el último paso y en la barra fija", () => {
    const checkout = read("app/(routes)/finalizar-compra/components/multi-step-checkout-form.tsx");
    expect(checkout).toContain("Precio final, incluye los impuestos aplicables");
    expect(checkout.match(/<LegalConsent action="checkout"/g)).toHaveLength(2);
    expect(checkout).not.toContain("políticas de entrega y cambios");
  });

  it("ningún texto de la tienda afirma «IVA incluido» (sirve se cobre o no IVA)", () => {
    const files = execFileSync("git", ["ls-files", "app", "components"], { cwd: root, encoding: "utf8" }).split("\n").filter((file) => /\.tsx?$/.test(file));
    expect(files.filter((file) => /IVA incluido/i.test(readFileSync(path.join(root, file), "utf8")))).toEqual([]);
  });
});
