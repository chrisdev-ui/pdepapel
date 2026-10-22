import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertTestDatabaseEnv } from "../../scripts/lib/test-database.mjs";
import { canLogin, pipeSecret, replaceEnvValue, withCredentials } from "../../scripts/rotation/lib.mjs";
import { discard, rotate } from "../../scripts/rotation/rotate.mjs";
import { testPrisma } from "./helpers/database";

const baseUrl = assertTestDatabaseEnv(process.env, "integración");
const schema = decodeURIComponent(new URL(baseUrl).pathname.slice(1));
const APP = "rotation_app_test";
const RO = "rotation_ro_test";
// Prisma prepara y reutiliza cada texto SQL; repetir el mismo CREATE USER tras un DROP deja la caché de cuentas de MySQL incoherente (1396). Cada prueba usa claves propias.
let OLD = "";

type Consumer = { label: string; newValue: string; oldValue?: string; apply: (value: string) => { ok: boolean; detail?: string } };

function recorder(failOn?: string) {
  const received: Record<string, string[]> = {};
  const make = (label: string, newValue: string, oldValue?: string): Consumer => ({
    label,
    newValue,
    oldValue,
    apply: (value) => {
      (received[label] ??= []).push(value);
      return label === failOn && value === newValue ? { ok: false, detail: `rechazado ${value}` } : { ok: true };
    },
  });
  return { received, make };
}

const lines: string[] = [];
const deps = (extra: Partial<{ secrets: string[] }> = {}) => ({ db: testPrisma, PrismaClient, log: (line: string) => lines.push(line), secrets: extra.secrets ?? [] });
const login = (user: string, password: string) => canLogin(withCredentials(baseUrl, user, password), user, PrismaClient);

async function createRoUser() {
  await testPrisma.$executeRawUnsafe(`CREATE USER '${RO}'@'%' IDENTIFIED BY '${OLD}'`);
  await testPrisma.$executeRawUnsafe(`GRANT SELECT ON \`${schema}\`.* TO '${RO}'@'%'`);
}

beforeEach(() => {
  OLD = `clave-vieja-${randomUUID()}`;
});

afterEach(async () => {
  lines.length = 0;
  await testPrisma.$executeRawUnsafe(`DROP USER IF EXISTS '${APP}'@'%'`);
  await testPrisma.$executeRawUnsafe(`DROP USER IF EXISTS '${RO}'@'%'`);
});
afterAll(() => testPrisma.$disconnect());

describe("rotación de credenciales (MySQL local)", () => {
  it("crea la cuenta de la app con DML en el esquema, sin mysql.user, y entrega la URL solo al consumidor", async () => {
    const { received, make } = recorder();
    const result = await rotate(
      { user: APP, create: { schema }, urlBase: baseUrl, consumers: (_p: string, url: string) => [make("vercel", url)] },
      deps(),
    );
    expect(result.ok).toBe(true);
    const url = received.vercel[0];
    expect(new URL(url).username).toBe(APP);
    expect(new URL(url).host).toBe(new URL(baseUrl).host);
    const password = decodeURIComponent(new URL(url).password);
    expect(password).toMatch(/^[0-9a-f]{48}$/);
    expect(lines.join("\n")).not.toContain(password);

    const app = new PrismaClient({ datasources: { db: { url } } });
    try {
      await expect(app.$queryRawUnsafe("SELECT COUNT(*) AS n FROM `Product`")).resolves.toBeDefined();
      await expect(app.$queryRawUnsafe("SELECT COUNT(*) AS n FROM performance_schema.global_status")).resolves.toBeDefined();
      await expect(app.$queryRawUnsafe("SELECT COUNT(*) AS n FROM mysql.user")).rejects.toThrow();
      await expect(app.$executeRawUnsafe("CREATE TABLE rotation_forbidden (id INT)")).rejects.toThrow();
    } finally {
      await app.$disconnect();
    }
  });

  it("no crea la cuenta si ya existe", async () => {
    await testPrisma.$executeRawUnsafe(`CREATE USER '${APP}'@'%' IDENTIFIED BY '${OLD}'`);
    await testPrisma.$executeRawUnsafe(`GRANT SELECT ON \`${schema}\`.* TO '${APP}'@'%'`);
    const { make } = recorder();
    await expect(rotate({ user: APP, create: { schema }, urlBase: baseUrl, consumers: (_p: string, url: string) => [make("vercel", url)] }, deps())).rejects.toThrow(/ya existe/);
    expect(await login(APP, OLD)).toBe(true);
  });

  it("si la comprobación extra falla, la cuenta nueva se borra y el consumidor no recibe nada", async () => {
    const { received, make } = recorder();
    const result = await rotate(
      { user: APP, create: { schema }, urlBase: baseUrl, consumers: (_p: string, url: string) => [make("vercel", url)], verify: async () => "falla forzada" },
      deps(),
    );
    expect(result).toMatchObject({ ok: false, stage: "verify", db: "reverted" });
    expect(received.vercel).toBeUndefined();
    const [row] = await testPrisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM mysql.user WHERE User = '${APP}'`);
    expect(Number(row.n)).toBe(0);
  });

  it("rota con la vieja como secundaria: las dos entran hasta discard, y después solo la nueva", async () => {
    await createRoUser();
    const { received, make } = recorder();
    const result = await rotate(
      { user: RO, urlBase: baseUrl, oldPassword: OLD, consumers: (p: string, url: string) => [make("password", p, OLD), make("url", url)] },
      deps({ secrets: [OLD] }),
    );
    expect(result.ok).toBe(true);
    const fresh = received.password[0];
    expect(await login(RO, fresh)).toBe(true);
    expect(await login(RO, OLD)).toBe(true);
    expect(lines.join("\n")).not.toContain(fresh);

    const after = await discard({ user: RO, currentUrl: withCredentials(baseUrl, RO, fresh) }, deps());
    expect(after).toEqual({ ok: true, discarded: 1 });
    expect(await login(RO, OLD)).toBe(false);
    expect(await login(RO, fresh)).toBe(true);
  });

  it("si un consumidor falla, los anteriores vuelven al valor viejo y la cuenta queda como estaba", async () => {
    await createRoUser();
    const { received, make } = recorder("github");
    const result = await rotate(
      { user: RO, urlBase: baseUrl, oldPassword: OLD, consumers: (p: string) => [make("railway", p, OLD), make("github", p, OLD), make("local", p, OLD)] },
      deps({ secrets: [OLD] }),
    );
    expect(result).toMatchObject({ ok: false, stage: "consumers", failed: "github", reverted: ["railway"], stuck: [], db: "reverted" });
    const fresh = received.railway[0];
    expect(received.railway).toEqual([fresh, OLD]);
    expect(received.local).toBeUndefined();
    expect(await login(RO, OLD)).toBe(true);
    expect(await login(RO, fresh)).toBe(false);
    const [row] = await testPrisma.$queryRawUnsafe<{ has: number }[]>(
      `SELECT JSON_EXTRACT(User_attributes, '$.additional_password') IS NOT NULL AS has FROM mysql.user WHERE User = '${RO}'`,
    );
    expect(Number(row.has)).toBe(0);
    expect(lines.join("\n")).not.toContain(fresh);
  });

  it("sin la contraseña vieja, un fallo deja la vieja como secundaria y avisa que no se corra discard", async () => {
    await createRoUser();
    const { make } = recorder("vercel");
    const result = await rotate({ user: RO, urlBase: baseUrl, consumers: (_p: string, url: string) => [make("vercel", url)] }, deps());
    expect(result).toMatchObject({ ok: false, stage: "consumers", db: "old-still-valid" });
    expect(await login(RO, OLD)).toBe(true);
    expect(lines.join("\n")).toMatch(/NO corras --phase discard/);
  });

  it("canLogin espera si la cuenta está en su tope de conexiones, en vez de dar la clave por mala", async () => {
    await createRoUser();
    await testPrisma.$executeRawUnsafe(`ALTER USER '${RO}'@'%' WITH MAX_USER_CONNECTIONS 1`);
    const holder = new PrismaClient({ datasources: { db: { url: withCredentials(baseUrl, RO, OLD) } } });
    await holder.$queryRawUnsafe("SELECT 1");
    const release = new Promise((resolve) => setTimeout(() => holder.$disconnect().then(resolve), 1500));
    expect(await canLogin(withCredentials(baseUrl, RO, OLD), RO, PrismaClient, { attempts: 5, waitMs: 800 })).toBe(true);
    await release;
    expect(await canLogin(withCredentials(baseUrl, RO, "clave-equivocada"), RO, PrismaClient, { attempts: 5, waitMs: 800 })).toBe(false);
  });

  it("no empieza si la cuenta ya tiene una contraseña secundaria", async () => {
    await createRoUser();
    await testPrisma.$executeRawUnsafe(`ALTER USER '${RO}'@'%' IDENTIFIED BY 'otra-${OLD}' RETAIN CURRENT PASSWORD`);
    const { make } = recorder();
    await expect(rotate({ user: RO, urlBase: baseUrl, oldPassword: OLD, consumers: (p: string) => [make("x", p)] }, deps())).rejects.toThrow(/secundaria/);
  });
});

describe("entrega de secretos", () => {
  it("pipeSecret manda el valor por stdin, nunca como argumento, y tapa lo que el comando repita", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rotation-"));
    const out = path.join(dir, "recibido");
    const script = `const fs=require("fs");let v="";process.stdin.on("data",d=>v+=d).on("end",()=>{fs.writeFileSync(${JSON.stringify(out)},JSON.stringify({v,argv:process.argv.slice(1)}));console.error("guardé "+v);process.exit(3)})`;
    const result = pipeSecret({ command: process.execPath, args: ["-e", script], value: "secreto-de-prueba-789", secrets: ["secreto-de-prueba-789"] });
    const seen = JSON.parse(readFileSync(out, "utf8"));
    expect(seen.v).toBe("secreto-de-prueba-789");
    expect(JSON.stringify(seen.argv)).not.toContain("secreto-de-prueba-789");
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("[oculto]");
    expect(result.detail).not.toContain("secreto-de-prueba-789");
  });

  it("replaceEnvValue cambia solo esa línea, respeta las comillas y deja el archivo en 600", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rotation-"));
    const file = path.join(dir, ".env");
    writeFileSync(file, 'OTRA=1\nDATABASE_URL="mysql://u:p@h:1/db"\n# DATABASE_URL=comentada\nFIN=2\n', { mode: 0o644 });
    replaceEnvValue(file, "DATABASE_URL", "mysql://u:nueva@h:1/db");
    expect(readFileSync(file, "utf8")).toBe('OTRA=1\nDATABASE_URL="mysql://u:nueva@h:1/db"\n# DATABASE_URL=comentada\nFIN=2\n');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});
