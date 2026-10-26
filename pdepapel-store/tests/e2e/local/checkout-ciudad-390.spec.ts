import { expect, Page, test } from "./helpers/local-test";

import { fillContact, fillDeliveryWithoutCarrier, formButton, startCheckout } from "./helpers/checkout";
import { filterLocations } from "../../../lib/location-search";

/**
 * Regresión del 26 oct (output/audits/checkout-abandono-fase0-2026-10-26.md):
 * en el teléfono el campo de ciudad borraba lo escrito cada vez que llegaban
 * resultados. Aquí se escribe como en un teléfono —una letra cada 400 ms, con
 * 300 ms de red— y lo escrito tiene que seguir ahí. Las ciudades salen de una
 * lista fija filtrada con la misma regla que la tienda y la administración.
 */

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

const option = (daneCode: string, city: string, department: string) => ({
  value: daneCode,
  label: `${city} - ${department}`,
  daneCode,
  city,
  department,
});

const DANE = [
  option("11001000", "BOGOTÁ D.C.", "BOGOTÁ D.C."),
  option("25572000", "PUERTO BOGOTA", "CUNDINAMARCA"),
  option("68001000", "BUCARAMANGA", "SANTANDER"),
  option("05001000", "MEDELLÍN", "ANTIOQUIA"),
  option("50325000", "MEDELLIN DEL ARIARI", "META"),
  option("05088000", "BELLO", "ANTIOQUIA"),
];

async function cityPage(page: Page) {
  const queries: string[] = [];
  await startCheckout(page);
  // Va después de la de `startCheckout`: Playwright usa la última ruta que coincide.
  await page.route("**/api/locations**", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    queries.push(q);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const results = q ? filterLocations(DANE, q) : DANE;
    await route
      .fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results, count: results.length }) })
      .catch(() => {});
  });
  await fillContact(page);
  return { queries, city: page.getByRole("combobox", { name: /Ciudad/ }) };
}

test.describe("ciudad en el teléfono", () => {
  test.describe.configure({ timeout: 180_000 });

  test("escribir letra por letra no borra nada y la ciudad se elige con un toque", async ({ page }) => {
    const { queries, city } = await cityPage(page);
    await city.tap();
    await city.pressSequentially("Bucaramanga", { delay: 400 });
    await expect(city).toHaveValue("Bucaramanga");
    const match = page.getByRole("option", { name: /BUCARAMANGA/ });
    await expect(match).toBeVisible({ timeout: 10_000 });
    // La búsqueda lleva la palabra completa, no una letra suelta.
    expect(queries.at(-1)).toBe("Bucaramanga");
    expect(queries).not.toContain("a");
    await match.tap();
    await expect(city).toHaveValue("BUCARAMANGA - SANTANDER");
  });

  test("ciudad y departamento juntos se encuentran y se eligen solos al seguir", async ({ page }) => {
    const { city } = await cityPage(page);
    await city.tap();
    await city.pressSequentially("Medellín, Antioquia", { delay: 120 });
    await expect(page.getByRole("option", { name: /MEDELLÍN/ })).toBeVisible({ timeout: 10_000 });
    await page.getByLabel(/^Dirección \*/).tap();
    await expect(city).toHaveValue("MEDELLÍN - ANTIOQUIA");
  });

  test("lo escrito sin elegir se queda, con un aviso; sin resultados ofrece WhatsApp", async ({ page }) => {
    const { city } = await cityPage(page);
    await city.tap();
    await city.pressSequentially("Pueblito", { delay: 120 });
    await expect(page.getByText("No se encontraron ciudades.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "¿No aparece? Escríbenos por WhatsApp" })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\//,
    );
    await page.getByLabel(/^Dirección \*/).tap();
    await expect(city).toHaveValue("Pueblito");
    await expect(page.getByText("Toca tu ciudad en la lista para elegirla.")).toBeVisible();
  });

  test("una dirección larga abre el campo de apartamento y dice dónde va", async ({ page }) => {
    await cityPage(page);
    await expect(page.getByLabel(/Apartamento, torre u oficina/)).toHaveCount(0);
    const address = page.getByLabel(/^Dirección \*/);
    await address.fill("Calle 123 # 45-67 Torre 3 Apartamento 502 Conjunto Los Pinos");
    await address.blur();
    await expect(page.getByLabel(/Apartamento, torre u oficina/)).toBeVisible();
    await expect(page.getByText(/pon la torre, el apartamento o el barrio en los campos de abajo/)).toBeVisible();
  });
});

test.describe("factura a nombre de la clienta", () => {
  test.describe.configure({ timeout: 180_000 });

  async function submittedBody(page: Page, document?: string) {
    let body: Record<string, unknown> | null = null;
    await startCheckout(page);
    await fillContact(page);
    await fillDeliveryWithoutCarrier(page);
    await page.route("**/checkout", async (route) => {
      if (route.request().method() === "POST") body = route.request().postDataJSON();
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    });
    const invoice = page.getByLabel("¿Necesitas factura a tu nombre? (cédula o NIT)");
    await expect(invoice).toBeVisible();
    if (document) await invoice.fill(document);
    await formButton(page, /Confirmar pedido|Pagar \$/).click();
    await expect.poll(() => body, { timeout: 20_000 }).not.toBeNull();
    return body as unknown as Record<string, unknown>;
  }

  test("sin factura el pedido no lleva documento", async ({ page }) => {
    const body = await submittedBody(page);
    expect(body).not.toHaveProperty("documentId");
  });

  test("con factura lleva la cédula, sin puntos ni espacios, y no queda guardada en el navegador", async ({ page }) => {
    const body = await submittedBody(page, "1.047.452 823");
    expect(body.documentId).toBe("1047452823");
    const stored = await page.evaluate(() => window.localStorage.getItem("checkout-storage") ?? "");
    expect(stored).not.toContain("1047452823");
  });
});

test.describe("avisos del pedido por WhatsApp", () => {
  test.describe.configure({ timeout: 180_000 });

  async function submit(page: Page, check: boolean) {
    let body: Record<string, unknown> | null = null;
    await startCheckout(page);
    const box = page.getByRole("checkbox", { name: "Recibir avisos de mi pedido por WhatsApp" });
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    if (check) await page.getByText("Recibir avisos de mi pedido por WhatsApp").click();
    await fillContact(page);
    await fillDeliveryWithoutCarrier(page);
    await page.route("**/checkout", async (route) => {
      if (route.request().method() === "POST") body = route.request().postDataJSON();
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    });
    await formButton(page, /Confirmar pedido|Pagar \$/).click();
    await expect.poll(() => body, { timeout: 20_000 }).not.toBeNull();
    return body as unknown as Record<string, unknown>;
  }

  test("sin marcar no viaja nada", async ({ page }) => {
    expect(await submit(page, false)).not.toHaveProperty("whatsappOptIn");
  });

  test("marcada viaja con la versión del texto", async ({ page }) => {
    expect((await submit(page, true)).whatsappOptIn).toEqual({ version: "2026-10-26" });
  });
});
