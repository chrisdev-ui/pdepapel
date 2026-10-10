import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ninguna casilla personal escrita en el código: el repositorio es público.
 * Los correos del equipo y de avisos viven en Configuración
 * (`lib/store-email-settings.ts`). La prueba mira la forma (una dirección de
 * Gmail, Hotmail, Outlook…), nunca una dirección concreta, y solo deja pasar
 * los archivos de esta lista, cada uno con su motivo.
 */
const REPO = path.resolve(__dirname, "../../../..");
const SOURCES = [
  "pdepapel-admin/app",
  "pdepapel-admin/lib",
  "pdepapel-admin/actions",
  "pdepapel-admin/components",
  "pdepapel-admin/emails",
  "pdepapel-admin/constants",
  "pdepapel-store/app",
  "pdepapel-store/lib",
  "pdepapel-store/components",
  "pdepapel-store/actions",
  "pdepapel-store/emails",
  "pdepapel-store/constants",
];
const PERSONAL_MAILBOX = /[A-Za-z0-9._%+-]+@(?:gmail|hotmail|outlook|yahoo|icloud|live)\.(?:com|es|co)\b/;

const ALLOWED: Record<string, string> = {
  "pdepapel-admin/lib/placeholder-emails.ts": "el correo de relleno de las ventas de mostrador; no es de nadie",
  "pdepapel-admin/lib/email.ts": "el correo público de la tienda, en el pie del correo a la clienta",
  "pdepapel-admin/lib/bold-terminal.ts": "usuario del datáfono de Bold; pendiente de decisión de Christian",
  "pdepapel-store/app/(routes)/contacto/page.tsx": "el correo público de la tienda",
  "pdepapel-store/components/footer.tsx": "el correo público de la tienda",
  "pdepapel-store/components/policy/policy-page.tsx": "el correo público de la tienda",
  "pdepapel-store/lib/organization-schema.ts": "el correo público de la tienda, en los datos estructurados",
  "pdepapel-store/app/(routes)/finalizar-compra/components/multi-step-checkout-form.tsx": "un ejemplo de formato en el mensaje de error",
  "pdepapel-store/app/(routes)/tarjeta-regalo/components/gift-card-form.tsx": "un ejemplo de formato en el mensaje de error",
};

function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "node_modules" || entry === ".next" ? [] : walk(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry) ? [full] : [];
  });
}

describe("sin casillas personales en el código", () => {
  it("solo los archivos permitidos tienen una dirección de un proveedor de correo personal", () => {
    const offenders = SOURCES.flatMap((source) => walk(path.join(REPO, source)))
      .map((file) => path.relative(REPO, file))
      .filter((file) => !(file in ALLOWED) && PERSONAL_MAILBOX.test(readFileSync(path.join(REPO, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("la forma reconoce una casilla personal y deja pasar el dominio de la tienda", () => {
    expect(PERSONAL_MAILBOX.test('to: ["alguien.ficticio@gmail.com"]')).toBe(true);
    expect(PERSONAL_MAILBOX.test('from: "orders@papeleriapdepapel.com"')).toBe(false);
  });
});
