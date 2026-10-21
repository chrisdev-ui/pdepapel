import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * La portada del grupo es solo del grupo, en 1280 y 390: en el reparto dice
 * «Solo del grupo», la variante que solo la muestra de respaldo lleva «Sin
 * foto propia» y el botón la filtra, y nada se desborda a lo ancho. En 1280,
 * pasar la estrella a otra foto deja la portada anterior sin repartir y el
 * guardado frena hasta elegirle destino. Con la base local de pruebas:
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/group-cover-only.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/portada-grupo-shots");

const NAME = "Cartuchera portada e2e";
const PHOTO = (name: string) => `https://res.cloudinary.com/test/image/upload/v1/e2e-portada/${name}.jpg`;
const COVER = PHOTO("portada");
const ROSA = PHOTO("rosa");
const OWN = PHOTO("propia");

test.use({ trace: "off" });
test.setTimeout(600_000);
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
let groupId = "";
let fallbackVariantId = "";

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function cleanup() {
  const groups = await db.productGroup.findMany({ where: { storeId, name: NAME }, select: { id: true } });
  const groupIds = groups.map((group) => group.id);
  const products = await db.product.findMany({ where: { storeId, OR: [{ sku: { startsWith: "E2E-PORTADA" } }, { productGroupId: { in: groupIds } }] }, select: { id: true } });
  const productIds = products.map((product) => product.id);
  await db.image.deleteMany({ where: { OR: [{ productId: { in: productIds } }, { productGroupId: { in: groupIds } }] } });
  await db.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
  await db.productSlugAlias.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.productGroup.deleteMany({ where: { id: { in: groupIds } } });
}

async function signIn(page: Page, pathname: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Revisar la portada de un grupo",
    redirectUrl: new URL(pathname, baseURL).toString(),
    sessionMaxDurationInSeconds: 600,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === pathname, { timeout: 120_000 });
}

test.describe("la portada del grupo es solo del grupo", () => {
  test.skip(!configured, "Necesita claves de desarrollo de Clerk.");

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    db = createTestPrismaClient("group-cover-only");
    await cleanup();
    await db.store.upsert({ where: { id: storeId }, update: {}, create: { id: storeId, name: "Tienda E2E", userId: clerkUserId! } });
    const type =
      (await db.type.findFirst({ where: { storeId, name: "E2E Oficina" } })) ??
      (await db.type.create({ data: { name: "E2E Oficina", slug: "e2e-oficina", storeId } }));
    const category =
      (await db.category.findFirst({ where: { storeId, name: "E2E Cartucheras" } })) ??
      (await db.category.create({ data: { name: "E2E Cartucheras", slug: "e2e-cartucheras", storeId, typeId: type.id } }));
    const size =
      (await db.size.findFirst({ where: { storeId, name: "E2E Único" } })) ??
      (await db.size.create({ data: { name: "E2E Único", value: "e2e-unico", storeId } }));
    const design =
      (await db.design.findFirst({ where: { storeId, name: "E2E Kawaii" } })) ??
      (await db.design.create({ data: { name: "E2E Kawaii", storeId } }));
    const rosa =
      (await db.color.findFirst({ where: { storeId, name: "E2E Rosado" } })) ??
      (await db.color.create({ data: { name: "E2E Rosado", value: "#111111", storeId } }));
    const azul =
      (await db.color.findFirst({ where: { storeId, name: "E2E Azul" } })) ??
      (await db.color.create({ data: { name: "E2E Azul", value: "#222222", storeId } }));

    const group = await db.productGroup.create({
      data: {
        name: NAME,
        description: "<p>Prueba</p>",
        storeId,
        images: {
          create: [
            { url: COVER, isMain: true, scope: "GROUP_ONLY", createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 1)) },
            { url: ROSA, isMain: false, scope: rosa.id, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 2)) },
          ],
        },
      },
    });
    groupId = group.id;
    const variant = (sku: string, colorId: string, images: { url: string; isMain: boolean; origin: "OWN" | "GROUP_COPY" }[]) =>
      db.product.create({
        data: {
          name: `${NAME} ${sku}`, slug: `e2e-portada-${sku.toLowerCase()}`, description: "<p>Prueba</p>", stock: 2, price: 18000, acqPrice: 7000,
          sku: `E2E-PORTADA-${sku}`, storeId, categoryId: category.id, colorId, sizeId: size.id, designId: design.id, productGroupId: group.id,
          hasNoProductIdentifier: true,
          images: { create: images },
        },
      });
    await variant("ROSA", rosa.id, [
      { url: OWN, isMain: true, origin: "OWN" },
      { url: ROSA, isMain: false, origin: "GROUP_COPY" },
    ]);
    fallbackVariantId = (await variant("AZUL", azul.id, [{ url: COVER, isMain: true, origin: "GROUP_COPY" }])).id;
  });

  test.afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "1280", width: 1280, height: 900 },
    { name: "390", width: 390, height: 844 },
  ]) {
    test(`«Solo del grupo» y «Sin foto propia» en ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/productos/grupo/${groupId}`);

      await expect(page.getByText("Solo del grupo", { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Portada del grupo — no se reparte")).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Quién recibe esta foto" })).toHaveCount(1);

      const toggle = page.getByRole("button", { name: /1 sin foto propia/ });
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle).toBeVisible();
      const box = await toggle.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(viewport.width < 640 ? 44 : 36);
      // La tabla (escritorio) y las tarjetas (teléfono) pintan la misma variante: vale la que se ve.
      await expect(page.getByText("Sin foto propia", { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText("E2E-PORTADA-AZUL").filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText("E2E-PORTADA-ROSA").filter({ visible: true })).toHaveCount(0);

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-grupo.png`), fullPage: true });
    });
  }

  test("pasar la estrella deja la portada anterior sin repartir hasta elegirle destino (1280)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, `/${storeId}/productos/grupo/${groupId}`);
    await expect(page.getByText("Solo del grupo", { exact: true })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Usar como foto principal" }).first().click();
    const selectors = page.getByRole("combobox", { name: "Quién recibe esta foto" });
    await expect(selectors).toHaveCount(1);
    await expect(selectors.first()).toContainText("Elige a quién le toca");

    await page.getByRole("button", { name: /Guardar grupo/i }).last().click();
    await expect(page.getByText(/Faltan fotos por repartir/).first()).toBeVisible({ timeout: 30_000 });

    await selectors.first().click();
    await page.getByRole("option", { name: "Todas las variantes" }).click();
    await page.getByRole("button", { name: /Guardar grupo/i }).last().click();

    await expect
      .poll(async () => (await db.image.findMany({ where: { productGroupId: groupId, isMain: true }, select: { url: true, scope: true } })), { timeout: 120_000 })
      .toEqual([{ url: ROSA, scope: "GROUP_ONLY" }]);
    const old = await db.image.findFirstOrThrow({ where: { productGroupId: groupId, url: COVER }, select: { isMain: true, scope: true } });
    expect(old).toEqual({ isMain: false, scope: "all" });
    // La azul ya recibe la portada anterior repartida: deja de mostrar solo la de respaldo.
    const azul = await db.image.findMany({ where: { productId: fallbackVariantId }, select: { url: true } });
    expect(azul.map((row) => row.url)).toEqual([COVER]);
  });
});
