import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { expect } from "vitest";

/**
 * Un aviso del panel salió con la plantilla (`PanelShell`), no en texto plano:
 * trae el HTML con la regla de la piel «panel», su título y su texto plano.
 */
export async function expectPanelEmail(email: { react?: ReactElement; text?: string }, expected: { label: string; title: string; text?: string | RegExp }) {
  expect(email.react, "el correo debe llevar la plantilla del panel").toBeTruthy();
  const html = await render(email.react!);
  expect(html).toContain(expected.label);
  expect(html).toContain(expected.title);
  expect(html).toContain("<html");
  expect(email.text, "el texto plano se conserva para quien lee sin HTML").toBeTruthy();
  if (expected.text) expect(email.text).toMatch(expected.text);
  return html;
}
