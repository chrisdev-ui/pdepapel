import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bots que piden `/x.php`: el middleware salta las rutas con extensión, así
 * que Clerk no corrió y `auth()` revienta con 500. El armazón de la tienda
 * corta con 404 antes de llamar a Clerk.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: null })),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@/components/shell/app-shell", () => ({ AppShell: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/store-initializer", () => ({ StoreInitializer: () => null }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import DashboardLayout from "@/app/(dashboard)/[storeId]/layout";
import { looksLikeStoreId } from "@/lib/store-id";

beforeEach(() => {
  mocks.auth.mockClear();
  mocks.notFound.mockClear();
});

describe("forma del id de tienda", () => {
  it("acepta un UUID y el id de la tienda de pruebas", () => {
    expect(looksLikeStoreId("f23ee5bc-1f6f-4c10-9872-9e6217cc17fd")).toBe(true);
    expect(looksLikeStoreId("e2e-admin-store")).toBe(true);
  });

  it("rechaza lo que piden los bots", () => {
    for (const value of ["x.php", "wp-login.php", ".env", "a".repeat(65), "", "a/b", "%2e%2e"]) {
      expect(looksLikeStoreId(value)).toBe(false);
    }
  });

  it("responde 404 a `/x.php` sin llamar a Clerk", async () => {
    await expect(DashboardLayout({ children: null, params: { storeId: "x.php" } })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("con un id válido sigue a Clerk como siempre", async () => {
    await expect(DashboardLayout({ children: null, params: { storeId: "e2e-admin-store" } })).rejects.toThrow("REDIRECT:/iniciar-sesion");
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
