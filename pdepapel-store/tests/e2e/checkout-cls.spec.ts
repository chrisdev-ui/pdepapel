import { expect, Page, Route, test } from "./helpers/safe-test";

import { gotoPublicPage, skipPrivacyBanner } from "./helpers/public-page";

/**
 * Layout-stability budget for the checkout. Field CLS on /finalizar-compra was
 * 0.58 over 28 days; these states are the ones that produced it. Everything is
 * mocked in the browser, so no order is created wherever this runs.
 *
 * Point E2E_BASE_URL at the build under test — against production this measures
 * whatever is deployed, not the working tree.
 */

const CLS_BUDGET = 0.1;

const PRODUCT_ID = "checkout-cls-e2e-product";

const CART_STORAGE = {
  state: {
    items: [
      {
        id: PRODUCT_ID,
        slug: "checkout-cls-e2e-product",
        category: { id: "category-id", name: "Pruebas", typeId: "" },
        name: "Separador kawaii de prueba",
        description: "No se envía ni crea una orden.",
        price: "1500",
        stock: 20,
        isFeatured: false,
        isArchived: false,
        size: { id: "size-id", name: "", value: "" },
        color: { id: "color-id", name: "Pastel", value: "#fff" },
        design: { id: "design-id", name: "Kawaii" },
        images: [],
        reviews: [],
        sku: "E2E-CLS",
        quantity: 2,
      },
    ],
  },
  version: 1,
};

const carrier = (
  idRate: number,
  name: string,
  totalCost: number,
  deliveryDays: string,
) => ({
  idRate,
  carrier: name,
  product: "Normal",
  flete: totalCost - 500,
  minimumInsurance: 500,
  totalCost,
  deliveryDays,
  isCOD: idRate % 2 === 0,
});

const quotesWith = (count: number) => ({
  success: true,
  daneCode: "05001000",
  packageDimensions: { weight: 0.2, height: 5, width: 20, length: 25 },
  quotes: [
    carrier(101, "COORDINADORA", 7280, "2"),
    carrier(102, "ENVIA", 8117, "3"),
    carrier(103, "TCC", 15772, "1"),
    carrier(104, "SERVIENTREGA", 9400, "2"),
    carrier(105, "INTERRAPIDISIMO", 6900, "4"),
  ].slice(0, count),
});

type ClsReport = {
  total: number;
  max: number;
  entries: { value: number; t: number; sources: string[] }[];
};

/**
 * Core Web Vitals CLS: the largest 1s-gap / 5s-window session of shifts that
 * were not within 500ms of a user input. `total` is the raw sum, kept because
 * it makes an offending state obvious even when it splits across windows.
 */
async function observeCls(page: Page) {
  await page.addInitScript(() => {
    const store = { total: 0, max: 0, entries: [] as unknown[] };
    (window as unknown as { __cls: typeof store }).__cls = store;

    let session = 0;
    let firstAt = 0;
    let lastAt = 0;

    const describe = (node: Node | null) => {
      if (!node || !(node instanceof Element)) return "unknown";
      const id = node.id ? `#${node.id}` : "";
      const cls =
        typeof node.className === "string" && node.className
          ? `.${node.className.trim().split(/\s+/).slice(0, 3).join(".")}`
          : "";
      return `${node.nodeName.toLowerCase()}${id}${cls}`;
    };

    new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const entry = raw as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: { node: Node | null }[];
        };
        if (entry.hadRecentInput) continue;

        store.total += entry.value;

        const withinSession =
          session > 0 &&
          entry.startTime - lastAt < 1000 &&
          entry.startTime - firstAt < 5000;
        if (withinSession) {
          session += entry.value;
          lastAt = entry.startTime;
        } else {
          session = entry.value;
          firstAt = entry.startTime;
          lastAt = entry.startTime;
        }
        if (session > store.max) store.max = session;

        store.entries.push({
          value: Number(entry.value.toFixed(5)),
          t: Math.round(entry.startTime),
          sources: (entry.sources ?? []).map((source) =>
            describe(source.node),
          ),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

const readCls = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __cls: ClsReport }).__cls,
  ) as Promise<ClsReport>;

const resetCls = (page: Page) =>
  page.evaluate(() => {
    const store = (window as unknown as { __cls: ClsReport }).__cls;
    store.total = 0;
    store.max = 0;
    store.entries = [];
  });

function report(label: string, cls: ClsReport) {
  const worst = [...cls.entries].sort((a, b) => b.value - a.value).slice(0, 4);
  console.log(
    `\nCLS · ${label}\n  session max: ${cls.max.toFixed(4)}   raw sum: ${cls.total.toFixed(4)}   shifts: ${cls.entries.length}`,
  );
  for (const entry of worst) {
    console.log(
      `    ${entry.value.toFixed(4)} @${entry.t}ms  ${entry.sources.join(", ") || "—"}`,
    );
  }
}

async function seedCheckout(page: Page) {
  await throttle(page);
  await observeCls(page);
  await skipPrivacyBanner(page);
  await page.addInitScript((cart) => {
    if (window.sessionStorage.getItem("pdp-e2e-cls-seeded")) return;
    window.sessionStorage.setItem("pdp-e2e-cls-seeded", "1");
    window.localStorage.setItem("cart-storage", JSON.stringify(cart));
    window.localStorage.removeItem("checkout-storage");
  }, CART_STORAGE);
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });

const mockQuotes = (page: Page, body: unknown, status = 200) =>
  page.route("**/shipment/quote", (route) => json(route, status, body));

const formButton = (page: Page, name: string | RegExp) =>
  page.locator("#checkout-form form").getByRole("button", { name });

/**
 * Lighthouse-mobile-class conditions. Without this an unthrottled laptop
 * finishes hydration before first paint and records no shift at all, which
 * would make this suite pass against the very code that scored 0.58 in field.
 */
async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

/** Waits for the form to be live and for late arrivals (Clerk) to settle. */
async function settle(page: Page, ms = 5000) {
  await page.waitForTimeout(ms);
}

async function fillContact(page: Page) {
  const next = formButton(page, "Continuar a entrega");
  await expect(next).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/Nombre y apellidos/).fill("Paula Andrea Restrepo");
  await page.getByLabel(/Correo electrónico/).fill("paula@ejemplo.com");
  await page.getByRole("textbox", { name: /Teléfono/ }).fill("3024686403");
  await page.getByLabel(/Documento de identidad/).fill("1047452823");
  await next.click();
  await expect(
    page.getByRole("heading", { name: "¿A dónde lo enviamos?" }),
  ).toBeVisible();
}

async function fillDelivery(page: Page) {
  const city = page.getByRole("combobox", { name: /Ciudad/ });
  await city.click();
  await city.fill("Medell");
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await page.getByLabel(/^Dirección \*/).fill("Calle 12 AA Sur #55D-30");
}

test.describe("estabilidad visual del checkout", () => {
  test.describe.configure({ timeout: 180_000 });

  // This is a lab measurement under CPU/network throttling: pointed at a remote
  // host it would be timing the network to Vercel rather than the build, and it
  // would make the production health check flaky. Run it against a local build:
  //   npm run build && PORT=3100 npm start
  //   E2E_BASE_URL=http://127.0.0.1:3100 npx playwright test tests/e2e/checkout-cls.spec.ts --project=mobile-chromium
  test.skip(
    !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(
      process.env.E2E_BASE_URL ?? "",
    ),
    "Solo corre contra un build local (E2E_BASE_URL=http://127.0.0.1:PORT).",
  );

  test("a · carga directa de /finalizar-compra", async ({ page }) => {
    await seedCheckout(page);
    await gotoPublicPage(page, "/finalizar-compra");
    await expect(formButton(page, "Continuar a entrega")).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);

    const cls = await readCls(page);
    report("a · carga directa", cls);
    expect(cls.max).toBeLessThan(CLS_BUDGET);
  });

  test("b · navegación cliente desde /carrito", async ({ page }) => {
    await seedCheckout(page);
    await gotoPublicPage(page, "/carrito");
    await page.waitForTimeout(1500);
    // Only the checkout's own shifts count towards its route.
    await resetCls(page);

    // The cart's CTA is a button that router.push()es — a real client-side nav.
    await page
      .getByRole("button", { name: "Finalizar compra" })
      .first()
      .click();
    await page.waitForURL("**/finalizar-compra", { timeout: 30_000 });
    await expect(formButton(page, "Continuar a entrega")).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);

    const cls = await readCls(page);
    report("b · navegación cliente (carrito → checkout)", cls);
    expect(cls.max).toBeLessThan(CLS_BUDGET);
  });

  for (const count of [1, 3, 5]) {
    test(`d · cotización con ${count} transportadora(s)`, async ({ page }) => {
      await seedCheckout(page);
      await mockQuotes(page, quotesWith(count));
      await gotoPublicPage(page, "/finalizar-compra");
      await fillContact(page);
      await settle(page, 1200);
      // Measure only the quote slot: placeholder → loading → loaded.
      await resetCls(page);

      await fillDelivery(page);
      await expect(page.locator('[id^="rate-"]').first()).toBeAttached({
        timeout: 20_000,
      });
      await settle(page, 1500);

      const cls = await readCls(page);
      report(`d · cotización, ${count} transportadora(s)`, cls);
      expect(cls.max).toBeLessThan(CLS_BUDGET);
    });
  }

  test("e · la cotización falla", async ({ page }) => {
    await seedCheckout(page);
    await mockQuotes(page, { error: "boom" }, 500);
    await gotoPublicPage(page, "/finalizar-compra");
    await fillContact(page);
    await settle(page, 1200);
    await resetCls(page);

    await fillDelivery(page);
    await expect(page.getByText(/No pudimos calcular el envío/)).toBeVisible({
      timeout: 20_000,
    });
    await settle(page, 1200);

    const cls = await readCls(page);
    report("e · error de cotización", cls);
    expect(cls.max).toBeLessThan(CLS_BUDGET);
  });

  test("e · ninguna transportadora cubre la dirección", async ({ page }) => {
    await seedCheckout(page);
    await mockQuotes(page, { success: true, daneCode: "05001000", quotes: [] });
    await gotoPublicPage(page, "/finalizar-compra");
    await fillContact(page);
    await settle(page, 1200);
    await resetCls(page);

    await fillDelivery(page);
    await expect(
      page.getByText(/Ninguna transportadora cubre esta dirección/),
    ).toBeVisible({ timeout: 20_000 });
    await settle(page, 1200);

    const cls = await readCls(page);
    report("e · sin cobertura", cls);
    expect(cls.max).toBeLessThan(CLS_BUDGET);
  });

  test("f · errores de validación al enviar", async ({ page }) => {
    await seedCheckout(page);
    await gotoPublicPage(page, "/finalizar-compra");
    const next = formButton(page, "Continuar a entrega");
    await expect(next).toBeVisible({ timeout: 30_000 });
    await settle(page, 1500);
    await resetCls(page);

    await next.click();
    await expect(page.getByText("Escribe tu nombre y apellidos")).toBeVisible();
    await settle(page, 1200);

    const cls = await readCls(page);
    report("f · errores de validación", cls);
    expect(cls.max).toBeLessThan(CLS_BUDGET);
  });
});
