import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertNoForbiddenKeys } from "../../helpers/forbidden-keys";

const mocks = vi.hoisted(() => ({ role: "owner" as "owner" | "viewer" }));

/** La fila completa de la tienda, como la guarda la base. */
const STORE_ROW = {
  id: "store-1",
  name: "Papelería",
  userId: "owner-1",
  logoUrl: "https://example.test/logo.png",
  phone: "3000000000",
  email: "tienda@example.test",
  address: "Calle 1",
  contactName: "Dueña",
  daneCode: "05001",
  storeMinMarginPercent: 30,
  mercadoLibreTargetMarginPercent: 25,
  mercadoLibreMinNetPerUnit: 2000,
  mercadoLibreLowPriceFixedFee: 900,
  policies: "{}",
};

/** Como Prisma: con `select` solo vuelven esas columnas. */
const pick = (args?: { select?: Record<string, boolean> }) =>
  args?.select ? Object.fromEntries(Object.keys(args.select).map((key) => [key, STORE_ROW[key as keyof typeof STORE_ROW]])) : { ...STORE_ROW };

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "owner-1" }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/store-access", () => ({ getStoreAccess: async () => ({ userId: "owner-1", role: mocks.role }) }));
vi.mock("@/lib/admin-access", () => ({ canCreateStore: () => false }));
vi.mock("@/lib/env.mjs", () => ({ env: { FRONTEND_STORE_URL: "https://store.test" } }));
vi.mock("@/lib/copiloto/config", () => ({ isCopilotConfigured: () => false }));
vi.mock("@/lib/mercadolibre/health-alerts", () => ({ countOpenMercadoLibreAlerts: async () => 0 }));
vi.mock("@/lib/presale", () => ({ overduePresaleWhere: () => ({}) }));
vi.mock("@/components/shell/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/components/store-initializer", () => ({ StoreInitializer: () => null }));
vi.mock("@/lib/prismadb", () => {
  const count = { count: async () => 0 };
  return {
    default: {
      store: { findFirst: async (args: { select?: Record<string, boolean> }) => pick(args), findMany: async (args: { select?: Record<string, boolean> }) => [pick(args)] },
      order: count,
      product: count,
      conversation: count,
      productPresale: count,
      stockReservation: count,
    },
  };
});

import DashboardLayout from "@/app/(dashboard)/[storeId]/layout";

async function shellStores() {
  const tree = (await DashboardLayout({ children: null, params: { storeId: "store-1" } })) as ReactElement;
  const children = (tree.props as { children: unknown[] }).children;
  const shell = children.find((child) => isValidElement(child) && (child.props as Record<string, unknown>).stores) as ReactElement;
  return (shell.props as { stores: unknown[] }).stores;
}

/**
 * El panel le pasaba al navegador (AppShell → selector de tiendas) la fila
 * entera de la tienda en todas las páginas: márgenes, pisos de Mercado
 * Libre, contacto y dirección. El selector solo usa id y nombre.
 */
describe("layout del panel: la tienda que llega al navegador", () => {
  beforeEach(() => {
    mocks.role = "owner";
  });

  it("solo lectura: id y nombre, nada más", async () => {
    mocks.role = "viewer";
    const stores = await shellStores();
    assertNoForbiddenKeys(stores, "viewer");
    expect(stores).toEqual([{ id: "store-1", name: "Papelería" }]);
  });

  it("dueña: también solo id y nombre", async () => {
    const stores = await shellStores();
    expect(stores).toEqual([{ id: "store-1", name: "Papelería" }]);
  });
});
