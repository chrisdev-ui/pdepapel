import { expect, test } from "@playwright/test";

const legacyRoutes = [
  ["/shop", "/tienda"],
  ["/about", "/nosotros"],
  ["/contact", "/contacto"],
  ["/cart", "/carrito"],
  ["/checkout", "/finalizar-compra"],
  ["/wishlist", "/favoritos"],
  ["/my-orders", "/mis-pedidos"],
  ["/product/slug-anterior", "/producto/slug-anterior"],
  ["/order/pedido-anterior", "/pedido/pedido-anterior"],
  ["/policies/data", "/politicas/privacidad"],
  ["/policies/returns", "/politicas/devoluciones"],
  ["/policies/shipping", "/politicas/envios"],
] as const;

const categorySlug = process.env.E2E_CATEGORY_SLUG || "boligrafos-lapiceros";
const archivedProductSlug =
  process.env.E2E_ARCHIVED_PRODUCT_SLUG || "mini-kit-lector";

test("expone robots y sitemap para la tienda en línea", async ({ request }) => {
  const [robotsResponse, sitemapResponse] = await Promise.all([
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
  ]);

  expect(robotsResponse.ok()).toBeTruthy();
  expect(sitemapResponse.ok()).toBeTruthy();
  expect(await robotsResponse.text()).toContain("Sitemap:");
  expect(await sitemapResponse.text()).toContain("<urlset");
});

test("redirige rutas en inglés a sus URLs canónicas en español", async ({
  request,
}) => {
  for (const [legacyPath, canonicalPath] of legacyRoutes) {
    const response = await request.get(legacyPath, { maxRedirects: 0 });

    expect(response.status(), legacyPath).toBe(308);
    expect(response.headers().location, legacyPath).toBe(canonicalPath);
  }
});

test("carga el SDK de pago solo durante la compra", async ({ request }) => {
  const [homeResponse, checkoutResponse] = await Promise.all([
    request.get("/"),
    request.get("/finalizar-compra"),
  ]);

  expect(homeResponse.ok()).toBeTruthy();
  expect(checkoutResponse.ok()).toBeTruthy();
  expect(await homeResponse.text()).not.toContain("checkout.bold.co");
  expect(await checkoutResponse.text()).toContain("checkout.bold.co");
});

test("mantiene la categoría acotada, canónica y sin filtro de categorías", async ({
  page,
}) => {
  const response = await page.goto(`/categoria/${categorySlug}`, {
    waitUntil: "domcontentloaded",
  });

  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("h1")).toBeVisible();
  await expect(
    page.locator('input[placeholder^="Buscar en "]:visible'),
  ).toBeVisible();
  await expect(page.getByText("Categorías", { exact: true })).toHaveCount(0);

  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute("href");
  expect(canonical).toContain(`/categoria/${categorySlug}`);
});

test("preserva las páginas históricas de productos archivados sin indexarlas", async ({
  page,
}) => {
  const response = await page.goto(`/producto/${archivedProductSlug}`, {
    waitUntil: "domcontentloaded",
  });

  expect(response?.ok()).toBeTruthy();
  await expect(
    page.getByText("Este producto ya no está disponible para la venta."),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("muestra una página de orden no encontrada sin convertirla en error 500", async ({
  page,
}) => {
  await page.goto("/pedido/pedido-inexistente-e2e", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("heading", { name: "Orden no encontrada" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "500", exact: true }),
  ).toHaveCount(0);
});

test("mantiene las rutas principales sin desplazamiento horizontal", async ({
  page,
}) => {
  for (const path of ["/", "/tienda", `/categoria/${categorySlug}`]) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });

    expect(response?.ok(), path).toBeTruthy();
    await page.waitForTimeout(300);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBeTruthy();
  }
});
