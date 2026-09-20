import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock("@/lib/prismadb", () => ({
  default: { store: { count: mocks.count } },
}));

import { canCreateStore, getAllowedAdminUserIds, hasAdminAccess, isAllowlistedOwner } from "@/lib/admin-access";

describe("admin access", () => {
  const originalAllowlist = process.env.ADMIN_ALLOWED_USER_IDS;

  beforeEach(() => {
    mocks.count.mockReset();
    delete process.env.ADMIN_ALLOWED_USER_IDS;
  });

  afterEach(() => {
    if (originalAllowlist === undefined) delete process.env.ADMIN_ALLOWED_USER_IDS;
    else process.env.ADMIN_ALLOWED_USER_IDS = originalAllowlist;
  });

  it("parses the optional comma-separated allowlist", () => {
    expect(getAllowedAdminUserIds()).toEqual([]);
    process.env.ADMIN_ALLOWED_USER_IDS = " user_a, user_b ,,";
    expect(getAllowedAdminUserIds()).toEqual(["user_a", "user_b"]);
    expect(isAllowlistedOwner("user_b")).toBe(true);
    expect(isAllowlistedOwner("user_c")).toBe(false);
    expect(isAllowlistedOwner(null)).toBe(false);
  });

  it("grants access to a store owner without touching the allowlist", async () => {
    mocks.count.mockResolvedValue(1);
    await expect(hasAdminAccess("owner_1")).resolves.toBe(true);
    expect(mocks.count).toHaveBeenCalledWith({ where: { userId: "owner_1" } });
  });

  it("denies a signed-in customer who owns nothing", async () => {
    mocks.count.mockResolvedValue(0);
    await expect(hasAdminAccess("customer_1")).resolves.toBe(false);
    await expect(hasAdminAccess(null)).resolves.toBe(false);
  });

  it("grants an allowlisted user before any store exists", async () => {
    process.env.ADMIN_ALLOWED_USER_IDS = "new_owner";
    await expect(hasAdminAccess("new_owner")).resolves.toBe(true);
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("solo deja crear tiendas a la lista explícita, nunca por ya tener una", () => {
    expect(canCreateStore("owner_1")).toBe(false);
    expect(canCreateStore(null)).toBe(false);

    process.env.ADMIN_ALLOWED_USER_IDS = "owner_1";
    expect(canCreateStore("owner_1")).toBe(true);
    expect(canCreateStore("otro")).toBe(false);
    expect(isAllowlistedOwner("owner_1")).toBe(true);
  });

  it("cerrar la creación no toca el acceso al panel: la dueña entra con la lista vacía", async () => {
    delete process.env.ADMIN_ALLOWED_USER_IDS;
    mocks.count.mockResolvedValue(1);
    await expect(hasAdminAccess("owner_1")).resolves.toBe(true);
    expect(canCreateStore("owner_1")).toBe(false);
  });
});
