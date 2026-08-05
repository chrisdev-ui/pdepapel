import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authMiddleware: vi.fn(() => "middleware"),
}));

vi.mock("@clerk/nextjs", () => ({
  authMiddleware: mocks.authMiddleware,
}));

import { publicRoutes } from "../../middleware";

describe("authentication middleware", () => {
  it("keeps localized Clerk routes public", () => {
    expect(publicRoutes).toEqual([
      "/api/:path*",
      "/iniciar-sesion(.*)",
      "/crear-cuenta(.*)",
    ]);
    expect(mocks.authMiddleware).toHaveBeenCalledWith({
      publicRoutes,
      signInUrl: "/iniciar-sesion",
    });
  });
});
