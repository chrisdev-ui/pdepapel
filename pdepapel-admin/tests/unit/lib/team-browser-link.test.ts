import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildTeamBrowserLinks, signTeamBrowserToken, TEAM_BROWSER_LINK_TTL_MS } from "@/lib/team-browser-link";

describe("enlace del navegador del equipo", () => {
  it("firma la expiración con un propósito propio (no sirve como secreto de revalidación)", () => {
    const now = 1_800_000_000_000;
    const token = signTeamBrowserToken("secreto", now);
    const [expires, signature] = token.split(".");
    expect(Number(expires)).toBe(now + TEAM_BROWSER_LINK_TTL_MS);
    const expected = createHmac("sha256", "secreto").update(`pdepapel:team-browser:v1:${expires}`).digest("base64url");
    expect(signature).toBe(expected);
    expect(signature).not.toBe(createHmac("sha256", "secreto").update(expires).digest("base64url"));
  });

  it("arma las dos direcciones de la tienda, sin barra doble", () => {
    const links = buildTeamBrowserLinks("https://papeleriapdepapel.com/", "secreto", 0);
    expect(links.markUrl.startsWith("https://papeleriapdepapel.com/equipo?t=")).toBe(true);
    expect(links.unmarkUrl).toBe("https://papeleriapdepapel.com/equipo?salir=1");
  });
});
