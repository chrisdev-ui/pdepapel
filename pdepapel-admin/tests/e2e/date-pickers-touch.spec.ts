import { createClerkClient } from "@clerk/backend";
import { expect, test, type Locator, type Page } from "./helpers/image-stub";

/**
 * Cada calendario del panel, abierto y elegido con el dedo (390×844, táctil)
 * y con el ratón (1280). En Safari un toque no enfoca el botón: el foco queda
 * en el diálogo y el calendario, que vive en un portal fuera de él, se cerraba
 * en el mismo instante en que se abría (2026-10-31, Paula en su iPhone). Una
 * pantalla nueva con `DateField` o `DateRangePicker` dentro de un diálogo debe
 * entrar en esta lista.
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);

type Usage = {
  name: string;
  path: string;
  /** Lo que hay que tocar para que aparezca el campo (abrir el diálogo, etc.). */
  reveal?: (page: Page, act: (locator: Locator) => Promise<void>) => Promise<void>;
  trigger: (page: Page) => Locator;
};

/** El botón «Nueva feria» a veces no abre al primer toque mientras la página termina de hidratar (igual en fair-events.spec.ts). */
async function openNewFair(page: Page, act: (locator: Locator) => Promise<void>) {
  const title = page.getByRole("heading", { name: "Nueva feria" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await act(page.getByRole("button", { name: "Nueva feria" }).first());
    if (await title.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) return;
  }
  await expect(title).toBeVisible({ timeout: 30_000 });
}

const inDialog = (page: Page) => page.locator('[role="dialog"], [role="alertdialog"]').first();

export const DATE_PICKER_USAGES: Usage[] = [
  {
    name: "Ferias › Nueva feria › Empieza (diálogo)",
    path: "ferias",
    reveal: openNewFair,
    trigger: (page) => page.locator("#startsAt"),
  },
  {
    name: "Ferias › Nueva feria › Termina (diálogo)",
    path: "ferias",
    reveal: openNewFair,
    trigger: (page) => page.locator("#endsAt"),
  },
  {
    name: "Promociones › Crear lote de cupones › Vigencia (diálogo)",
    path: "promociones?tab=cupones",
    reveal: async (page, act) => act(page.getByRole("button", { name: "Crear lote de cupones" })),
    trigger: (page) => inDialog(page).locator("button:has(.lucide-calendar-days)").first(),
  },
  {
    name: "Rendimiento › Caja › Registrar movimiento › Fecha (diálogo)",
    path: "rendimiento?sub=caja",
    reveal: async (page, act) => act(page.getByRole("button", { name: "Registrar", exact: true }).first()),
    trigger: (page) => page.getByRole("button", { name: "Fecha del movimiento" }),
  },
  {
    name: "Reportes tributarios › Registrar compra › Fecha de la factura (diálogo)",
    path: "reportes-tributarios",
    reveal: async (page, act) => act(page.getByRole("button", { name: "Registrar compra" })),
    trigger: (page) => page.locator("#purchase-issued-at"),
  },
  {
    name: "Reportes tributarios › Periodo › Desde",
    path: "reportes-tributarios",
    trigger: (page) => page.locator("#report-start-date"),
  },
  {
    name: "Reportes tributarios › Periodo › Hasta",
    path: "reportes-tributarios",
    trigger: (page) => page.locator("#report-end-date"),
  },
  {
    name: "Cupones › Nuevo cupón › Vigencia",
    path: "cupones/nuevo",
    trigger: (page) => page.locator("form button:has(.lucide-calendar-days)").first(),
  },
  {
    name: "Ofertas › Nueva oferta › Vigencia",
    path: "ofertas/nuevo",
    trigger: (page) => page.locator("form button:has(.lucide-calendar-days)").first(),
  },
  {
    name: "Portada › Nuevo contenido › Fecha de inicio",
    path: "portada/nuevo",
    trigger: (page) => page.getByRole("button", { name: "Fecha de inicio" }),
  },
  {
    name: "Portada › Nuevo contenido › Fecha de fin",
    path: "portada/nuevo",
    trigger: (page) => page.getByRole("button", { name: "Fecha de fin" }),
  },
  {
    name: "Productos › Ficha › Preventa › Cuándo llega",
    path: "productos/e2e-fair-product",
    trigger: (page) => page.locator("#presale-arrival"),
  },
  {
    name: "Productos › Acción en lote «Marcar próximamente» › Fecha de llegada (alerta)",
    path: "productos",
    reveal: async (page, act) => {
      // En el teléfono la lista son tarjetas: primero «Seleccionar», luego la primera.
      const select = page.getByRole("button", { name: "Seleccionar", exact: true });
      if (await select.isVisible().catch(() => false)) {
        await act(select);
        await act(page.getByRole("checkbox").first());
      } else {
        await act(page.getByRole("checkbox").nth(1));
      }
      await act(page.getByRole("button", { name: /Marcar próximamente/ }).first());
    },
    trigger: (page) => page.getByRole("button", { name: "Fecha de llegada" }),
  },
  {
    name: "Productos › Ficha › Disponible desde",
    path: "productos/e2e-fair-product",
    trigger: (page) => page.getByRole("button", { name: "Fecha desde la que se puede comprar" }),
  },
];

async function signIn(page: Page, path: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Calendarios con el dedo",
    redirectUrl: new URL(`/${storeId}/${path}`, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`/${storeId}/${path.split("?")[0]}`));
}

/** Abre el calendario del campo, elige el día 15 y devuelve la etiqueta antes y después. */
async function pickFifteenth(page: Page, trigger: Locator, act: (locator: Locator) => Promise<void>) {
  await trigger.scrollIntoViewIfNeeded();
  const before = (await trigger.innerText()).trim();
  await act(trigger);
  const grid = page.getByRole("grid").first();
  await expect(grid, "el calendario debe quedarse abierto después del toque").toBeVisible();
  await act(grid.getByRole("gridcell", { name: "15", exact: true }).first());
  await expect(trigger).not.toHaveText(before);
  return { before, after: (await trigger.innerText()).trim() };
}

test.describe("calendarios: abrir, tocar un día y que quede", () => {
  test.skip(!configured, "Necesita claves de desarrollo de Clerk (sk_test_) y E2E_ADMIN_CLERK_USER_ID.");

  for (const usage of DATE_PICKER_USAGES) {
    test(usage.name, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const touch = testInfo.project.use.hasTouch === true;
      const act = (locator: Locator) => (touch ? locator.tap() : locator.click());
      await signIn(page, usage.path);
      if (usage.reveal) await usage.reveal(page, act);
      const trigger = usage.trigger(page);
      await expect(trigger).toBeVisible({ timeout: 30_000 });
      const { before, after } = await pickFifteenth(page, trigger, act);
      testInfo.annotations.push({ type: "valor", description: `${before} → ${after}` });
    });
  }

  test("Ferias › crear una feria con fechas elegidas con el dedo", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const touch = testInfo.project.use.hasTouch === true;
    const act = (locator: Locator) => (touch ? locator.tap() : locator.click());
    await signIn(page, "ferias");
    await openNewFair(page, act);
    const name = `E2E Feria calendario ${testInfo.project.name} ${Date.now()}`;
    await page.getByLabel("Nombre", { exact: true }).fill(name);
    await pickFifteenth(page, page.locator("#startsAt"), act);
    await pickFifteenth(page, page.locator("#endsAt"), act);
    const startsAt = await page.locator('input[name="startsAt"]').inputValue();
    expect(startsAt).toMatch(/^\d{4}-\d{2}-15$/);
    await Promise.all([
      page.waitForURL(new RegExp(`/${storeId}/ferias/[^/?]+$`), { timeout: 30_000 }),
      act(page.getByRole("button", { name: "Crear feria" })),
    ]);
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
  });
});
