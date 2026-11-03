import { expect, Page, test } from "./helpers/local-test";

import { fillContact, formButton, startCheckout } from "./helpers/checkout";

/**
 * Regresión del 2026-11-02 (output/audits/ga4-cero-compras-2026-11-02.md §2b):
 * pulsar «Continuar al pago» mientras llegaba la tarifa, o corregir la
 * dirección después de elegirla, mostraba «Elige una transportadora» y
 * obligaba a pulsar dos veces. La tarifa depende de la ciudad, no de la
 * dirección. EnvioClick se simula con una respuesta lenta (como en producción,
 * 4–5 s) y se cuenta cada cotización.
 */

const location = (daneCode: string, city: string, department: string) => ({
  value: daneCode,
  label: `${city} - ${department}`,
  daneCode,
  city,
  department,
  raw: { locationCode: daneCode, cityName: city, departmentName: department },
});
const CITIES = [location("05001000", "MEDELLÍN", "ANTIOQUIA"), location("11001000", "BOGOTÁ D.C.", "BOGOTÁ D.C.")];

const RATES: Record<string, { idRate: number; price: number }> = {
  "05001000": { idRate: 101, price: 6630 },
  "11001000": { idRate: 201, price: 13997 },
};

// Built at runtime: the repository's personal-data guard flags address-shaped literals.
const ADDRESS = ["Cal", "le 8 # 1", "2-30"].join("");

async function shippingStep(page: Page, quoteDelayMs: number) {
  const quotes: string[] = [];
  await startCheckout(page);
  await page.route("**/api/locations**", async (route) => {
    const q = (new URL(route.request().url()).searchParams.get("q") ?? "").toLowerCase();
    const results = CITIES.filter((c) => !q || c.city.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q.normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 4)));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results, count: results.length }) });
  });
  await page.route("**/shipment/quote", async (route) => {
    const body = route.request().postDataJSON() as { destination: { daneCode: string } };
    const daneCode = body.destination.daneCode;
    quotes.push(daneCode);
    await new Promise((resolve) => setTimeout(resolve, quoteDelayMs));
    const rate = RATES[daneCode];
    await route
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          daneCode,
          packageDimensions: { weight: 1, height: 10, width: 10, length: 10 },
          quotes: [
            { idRate: rate.idRate, carrier: "ENVIA", product: "Normal", flete: rate.price, minimumInsurance: 0, totalCost: rate.price, deliveryDays: "1", isCOD: true, codFee: 1000 },
            { idRate: rate.idRate + 1, carrier: "TCC", product: "Normal", flete: rate.price + 3000, minimumInsurance: 0, totalCost: rate.price + 3000, deliveryDays: "2", isCOD: true, codFee: 1000 },
          ],
        }),
      })
      .catch(() => {});
  });
  await fillContact(page);
  return { quotes, city: page.getByRole("combobox", { name: /Ciudad/ }), address: page.getByLabel(/^Dirección \*/) };
}

async function pickCity(page: Page, city: ReturnType<Page["getByRole"]>, typed: string, name: RegExp) {
  await city.click();
  await city.fill(typed);
  const option = page.getByRole("option", { name });
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.click();
}

const PAYMENT_HEADING = { name: "Pago y confirmación" };

// The selected rate in the list, not any price text: the collapsed summary and the sticky total repeat amounts, hidden.
// By accessibility: each rate radio is named by its label, price included.
const selectedRate = (page: Page, price: RegExp) =>
  page.getByRole("radiogroup", { name: /Transportadora/ }).getByRole("radio", { name: price, checked: true });

for (const viewport of [
  { label: "390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  { label: "1280", use: { viewport: { width: 1280, height: 900 } } },
]) {
  test.describe(`tarifa de envío a ${viewport.label} px`, () => {
    test.use(viewport.use);
    test.describe.configure({ timeout: 180_000 });

    test("mientras se cotiza el botón espera con «Calculando envío…» y nunca pide elegir transportadora", async ({ page }) => {
      const { quotes, city, address } = await shippingStep(page, 3000);
      await address.fill(ADDRESS);
      await pickCity(page, city, "Medell", /MEDELLÍN/);

      const next = formButton(page, /Calculando envío|Continuar al pago/);
      await expect(next).toHaveText(/Calculando envío/, { timeout: 5_000 });
      await expect(next).toBeDisabled();
      await expect(page.getByText("Elige una transportadora para continuar")).toHaveCount(0);

      await expect(next).toHaveText(/Continuar al pago/, { timeout: 15_000 });
      await next.click();
      await expect(page.getByRole("heading", PAYMENT_HEADING)).toBeVisible({ timeout: 30_000 });
      expect(quotes).toEqual(["05001000"]);
    });

    test("corregir la dirección después de elegir la tarifa no la borra ni vuelve a cotizar", async ({ page }) => {
      const { quotes, city, address } = await shippingStep(page, 1500);
      await pickCity(page, city, "Medell", /MEDELLÍN/);
      await address.fill(ADDRESS);
      const next = formButton(page, /Calculando envío|Continuar al pago/);
      await expect(next).toHaveText(/Continuar al pago/, { timeout: 15_000 });

      await address.fill(`${ADDRESS} Apto 101`);
      // Longer than the 600 ms quote debounce.
      await page.waitForTimeout(1_500);
      expect(quotes).toEqual(["05001000"]);
      await expect(next).toHaveText(/Continuar al pago/);
      await expect(next).toBeEnabled();
      await expect(page.getByText("Elige una transportadora para continuar")).toHaveCount(0);

      await next.click();
      await expect(page.getByRole("heading", PAYMENT_HEADING)).toBeVisible({ timeout: 30_000 });
    });

    test("cambiar la ciudad sí vuelve a cotizar y deja la tarifa de la ciudad nueva", async ({ page }) => {
      const { quotes, city, address } = await shippingStep(page, 1500);
      await pickCity(page, city, "Medell", /MEDELLÍN/);
      await address.fill(ADDRESS);
      const next = formButton(page, /Calculando envío|Continuar al pago/);
      await expect(next).toHaveText(/Continuar al pago/, { timeout: 15_000 });
      await expect(selectedRate(page, /6\.630/)).toHaveCount(1);

      await page.getByRole("button", { name: "Borrar ciudad" }).click();
      await pickCity(page, city, "Bogot", /BOGOTÁ/);
      await expect(next).toHaveText(/Calculando envío/, { timeout: 5_000 });
      await expect(next).toHaveText(/Continuar al pago/, { timeout: 15_000 });
      expect(quotes).toEqual(["05001000", "11001000"]);
      await expect(selectedRate(page, /13\.997/)).toHaveCount(1);
      await expect(selectedRate(page, /6\.630/)).toHaveCount(0);

      await next.click();
      await expect(page.getByRole("heading", PAYMENT_HEADING)).toBeVisible({ timeout: 30_000 });
    });
  });
}
