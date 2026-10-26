// @vitest-environment jsdom

import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/equipo/route";
import { isTeamBrowser, TEAM_BROWSER_COOKIE } from "@/lib/team-browser";
import { TEAM_BROWSER_TOKEN_MAX_AGE_MS, verifyTeamBrowserToken } from "@/lib/team-browser-token";

const SECRET = "secreto-compartido";
const token = (expiresAt: number, secret = SECRET) =>
  `${expiresAt}.${createHmac("sha256", secret).update(`pdepapel:team-browser:v1:${expiresAt}`).digest("base64url")}`;

afterEach(() => {
  vi.unstubAllEnvs();
  document.cookie = `${TEAM_BROWSER_COOKIE}=; max-age=0; path=/`;
});

describe("token del navegador del equipo", () => {
  const now = 1_800_000_000_000;

  it("acepta solo la firma del panel, vigente y con su propósito", () => {
    expect(verifyTeamBrowserToken(token(now + 60_000), SECRET, now)).toBe(true);
    expect(verifyTeamBrowserToken(token(now + 60_000, "otro"), SECRET, now)).toBe(false);
    expect(verifyTeamBrowserToken(token(now - 1), SECRET, now)).toBe(false);
    expect(verifyTeamBrowserToken(token(now + TEAM_BROWSER_TOKEN_MAX_AGE_MS + 1), SECRET, now)).toBe(false);
    const sinProposito = `${now + 60_000}.${createHmac("sha256", SECRET).update(String(now + 60_000)).digest("base64url")}`;
    expect(verifyTeamBrowserToken(sinProposito, SECRET, now)).toBe(false);
    expect(verifyTeamBrowserToken("basura", SECRET, now)).toBe(false);
    expect(verifyTeamBrowserToken(token(now + 60_000), undefined, now)).toBe(false);
  });
});

describe("/equipo", () => {
  const call = (search: string) => GET(new NextRequest(`https://papeleriapdepapel.com/equipo${search}`));

  it("con un enlace válido marca el navegador 400 días y vuelve a Inicio", () => {
    vi.stubEnv("REVALIDATION_SECRET", SECRET);
    const response = call(`?t=${encodeURIComponent(token(Date.now() + 60_000))}`);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://papeleriapdepapel.com/");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.cookies.get(TEAM_BROWSER_COOKIE);
    expect(cookie?.value).toBe("1");
    expect(cookie?.maxAge).toBe(400 * 24 * 60 * 60);
    expect(cookie?.httpOnly).toBe(false);
  });

  it("un enlace vencido o falso no marca nada", () => {
    vi.stubEnv("REVALIDATION_SECRET", SECRET);
    expect(call(`?t=${encodeURIComponent(token(Date.now() - 1))}`).cookies.get(TEAM_BROWSER_COOKIE)).toBeUndefined();
    expect(call("?t=123.abc").cookies.get(TEAM_BROWSER_COOKIE)).toBeUndefined();
  });

  it("?salir=1 quita la marca", () => {
    const response = call("?salir=1");
    expect(response.cookies.get(TEAM_BROWSER_COOKIE)?.maxAge).toBe(0);
  });
});

describe("isTeamBrowser", () => {
  it("lee la cookie del navegador", () => {
    expect(isTeamBrowser()).toBe(false);
    document.cookie = `${TEAM_BROWSER_COOKIE}=1; path=/`;
    expect(isTeamBrowser()).toBe(true);
  });
});
