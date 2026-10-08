import { createClerkClient } from "@clerk/backend";
import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";

/**
 * Un producto suelto se convierte en grupo desde su propia página con varios
 * colores: «Más › Convertir en variantes» abre el editor de grupo con el
 * producto ya adoptado, «Generar combinaciones» crea una variante por color y
 * al guardar el producto no se duplica. Corre contra la base de pruebas local.
 */

const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const hasConfiguration = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const testDatabase = (process.env.DATABASE_URL ?? "").endsWith("/pdepapel_test");

const NAME = "Folder tarjetero e2e";
const COLOR_NAMES = ["E2E Rosado", "E2E Azul", "E2E Verde", "E2E Lila"];

test.use({ trace: "off" });
test.setTimeout(600_000);

let db: PrismaClient;
let productId = "";

async function cleanup() {
  const groups = await db.productGroup.findMany({ where: { storeId, name: NAME }, select: { id: true } });
  const groupIds = groups.map((group) => group.id);
  const products = await db.product.findMany({
    where: { storeId, OR: [{ sku: { startsWith: "E2E-FOLDER" } }, { productGroupId: { in: groupIds } }] },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  await db.image.deleteMany({ where: { OR: [{ productId: { in: productIds } }, { productGroupId: { in: groupIds } }] } });
  await db.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
  await db.productSlugAlias.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.productGroup.deleteMany({ where: { id: { in: groupIds } } });
}

async function signIn(page: Page, path: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Convertir un producto suelto en grupo con varios colores",
    redirectUrl: new URL(path, baseURL).toString(),
    sessionMaxDurationInSeconds: 600,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === path, { timeout: 120_000 });
}

test.describe("convertir un producto suelto en grupo", () => {
  test.skip(!hasConfiguration || !testDatabase, "Necesita claves de desarrollo de Clerk y la base pdepapel_test.");

  test.beforeAll(async () => {
    db = new PrismaClient();
    await cleanup();
    await db.store.upsert({ where: { id: storeId }, update: {}, create: { id: storeId, name: "Tienda E2E", userId: clerkUserId! } });
    const type =
      (await db.type.findFirst({ where: { storeId, name: "E2E Oficina" } })) ??
      (await db.type.create({ data: { name: "E2E Oficina", slug: "e2e-oficina", storeId } }));
    const category =
      (await db.category.findFirst({ where: { storeId, name: "E2E Folders" } })) ??
      (await db.category.create({ data: { name: "E2E Folders", slug: "e2e-folders", storeId, typeId: type.id } }));
    const size =
      (await db.size.findFirst({ where: { storeId, name: "E2E Único" } })) ??
      (await db.size.create({ data: { name: "E2E Único", value: "e2e-unico", storeId } }));
    const design =
      (await db.design.findFirst({ where: { storeId, name: "E2E Kawaii" } })) ??
      (await db.design.create({ data: { name: "E2E Kawaii", storeId } }));
    const colors = [];
    for (let index = 0; index < COLOR_NAMES.length; index += 1) {
      const name = COLOR_NAMES[index];
      colors.push(
        (await db.color.findFirst({ where: { storeId, name } })) ??
          (await db.color.create({ data: { name, value: `#${String(index + 1).repeat(6)}`, storeId } })),
      );
    }
    const product = await db.product.create({
      data: {
        name: NAME, slug: "e2e-folder-tarjetero", description: "<p>Prueba</p>", stock: 5, price: 18000, acqPrice: 7000,
        sku: "E2E-FOLDER-1", storeId, categoryId: category.id, colorId: colors[0].id, sizeId: size.id, designId: design.id,
        hasNoProductIdentifier: true,
        images: {
          create: Array.from({ length: 10 }, (_, index) => ({
            url: `https://res.cloudinary.com/test/image/upload/v1/e2e-folder/foto-${index + 1}.jpg`,
            isMain: index === 0,
            origin: "OWN",
          })),
        },
      },
    });
    productId = product.id;
  });

  test.afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  test("«Convertir en variantes» abre el grupo con el producto adoptado y crea un color por variante", async ({ page }) => {
    await signIn(page, `/${storeId}/productos/${productId}`);
    await page.getByRole("button", { name: /^Más/ }).first().click();
    await page.getByRole("menuitem", { name: "Convertir en variantes" }).click();

    await page.waitForURL(new RegExp(`/${storeId}/productos/nuevo-grupo\\?producto=${productId}`), { timeout: 60_000 });
    await expect(page.getByText("Productos traídos al grupo").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("textbox", { name: /Nombre/ }).first()).toHaveValue(NAME);

    const colorPicker = page.getByRole("combobox").filter({ hasText: COLOR_NAMES[0] }).first();
    await colorPicker.click();
    for (const name of COLOR_NAMES.slice(1)) {
      await page.getByRole("option", { name }).click();
    }
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Generar combinaciones" }).first().click();
    const matrix = page.getByRole("dialog");
    await expect(matrix).toBeVisible();
    await matrix.getByRole("button", { name: "Crear variantes" }).click();
    await expect(page.getByText("3 variantes nuevas se crean al guardar, con 0 unidades.").first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Crear grupo" }).last().click();
    await page.waitForURL((url) => !url.pathname.includes("nuevo-grupo"), { timeout: 240_000 });

    const base = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { productGroupId: true, stock: true } });
    expect(base.productGroupId).not.toBeNull();
    expect(base.stock).toBe(5);
    const members = await db.product.findMany({ where: { productGroupId: base.productGroupId }, select: { id: true, colorId: true, stock: true } });
    expect(members).toHaveLength(4);
    expect(new Set(members.map((member) => member.colorId)).size).toBe(4);
    expect(members.filter((member) => member.id !== productId).every((member) => member.stock === 0)).toBe(true);
  });
});
