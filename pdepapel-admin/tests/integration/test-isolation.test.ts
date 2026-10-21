import { describe, expect, it } from "vitest";

import { TEST_ENV_STUBS } from "../../scripts/lib/test-isolation.mjs";
import { testPrisma } from "./helpers/database";

/** Lo mismo que en las unitarias, con la configuración y el arranque de integración. */
describe("aislamiento de integración", () => {
  it("el contrato de lib/env.mjs acepta todos los valores de prueba", async () => {
    const { env } = await import("@/lib/env.mjs");
    expect(env.OPENAI_API_KEY).toBe(TEST_ENV_STUBS.OPENAI_API_KEY);
    expect(env.BOLD_ENVIRONMENT).toBe("test");
  });

  it("con Prisma ya cargado, las claves siguen siendo las de prueba", async () => {
    await testPrisma.$queryRaw`SELECT 1`;
    for (const name of ["META_IG_PAGE_TOKEN", "TIKTOK_CLIENT_SECRET", "SOCIAL_TOKEN_ENCRYPTION_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "WHATSAPP_ACCESS_TOKEN", "MERCADOLIBRE_CLIENT_SECRET", "QSTASH_TOKEN", "CLERK_SECRET_KEY", "RESEND_API_KEY"] as const) {
      expect(process.env[name], name).toBe(TEST_ENV_STUBS[name]);
    }
  });

  it("una llamada a un host real falla con el error del arnés, y MySQL local responde", async () => {
    const error = await fetch("https://api.resend.com/emails").then(
      () => null,
      (reason: Error & { cause?: Error }) => reason,
    );
    expect(String(error?.cause?.message ?? error?.message)).toContain("[pruebas] red bloqueada: api.resend.com:443");
    for (const host of ["graph.facebook.com", "graph.instagram.com", "open.tiktokapis.com"]) {
      const blocked = await fetch(`https://${host}/`).then(
        () => null,
        (reason: Error & { cause?: Error }) => reason,
      );
      expect(String(blocked?.cause?.message ?? blocked?.message), host).toContain(`[pruebas] red bloqueada: ${host}:443`);
    }
    const [row] = await testPrisma.$queryRaw<{ ok: bigint }[]>`SELECT 1 AS ok`;
    expect(Number(row.ok)).toBe(1);
  });
});
