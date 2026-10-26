import { randomUUID } from "node:crypto";

import { Webhook } from "standardwebhooks";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhook/clerk/route";

import { TEST_ENV_STUBS } from "../../scripts/lib/test-isolation.mjs";
import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";
import { testPrisma } from "./helpers/database";

/**
 * Webhook de Clerk (user.created), firmado aquí con el secreto de prueba: nada
 * sale a Clerk. Guarda el consentimiento del registro una sola vez, con la
 * casilla de Clerk (legal_accepted_at) o, si falta, con las versiones que la
 * tienda puso en unsafeMetadata; sin ninguna prueba no guarda nada.
 */
const secret = TEST_ENV_STUBS.CLERK_WEBHOOK_SIGNING_SECRET;
const users: string[] = [];

function signed(event: unknown, options: { id?: string; secret?: string } = {}) {
  const id = options.id ?? `msg_${randomUUID()}`;
  const body = JSON.stringify(event);
  const timestamp = new Date();
  const signature = new Webhook(options.secret ?? secret).sign(id, timestamp, body);
  return new Request("http://admin.test/api/webhook/clerk", {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)), "svix-signature": signature },
    body,
  });
}

function userCreated(overrides: Record<string, unknown> = {}) {
  const id = `user_${randomUUID().replaceAll("-", "")}`;
  users.push(id);
  return { type: "user.created", object: "event", data: { id, object: "user", created_at: 1792630000000, legal_accepted_at: null, unsafe_metadata: {}, email_addresses: [{ email_address: "persona@prueba.test" }], first_name: "Persona", ...overrides } };
}

const records = (clerkUserId: string) => testPrisma.legalConsentRecord.findMany({ where: { clerkUserId } });

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  await testPrisma.legalConsentRecord.deleteMany({ where: { clerkUserId: { in: users } } });
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("webhook de Clerk: consentimiento al crear la cuenta", () => {
  it("con la casilla de Clerk guarda la hora de Clerk y las versiones vigentes; solo el id, ningún dato de la persona", async () => {
    const event = userCreated({ legal_accepted_at: 1792630123000 });
    const response = await POST(signed(event));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, recorded: true });
    assertNoForbiddenKeys(body, "viewer");
    const [row] = await records(event.data.id as string);
    expect(row).toMatchObject({ channel: "REGISTRO", termsVersion: "2026-10-21", privacyVersion: "2026-10-26", evidence: "legal_accepted_at" });
    expect(row.consentedAt.getTime()).toBe(1792630123000);
    expect(JSON.stringify(row)).not.toMatch(/persona@prueba|Persona/);
  });

  it("sin la casilla, con las versiones del <SignUp> de la tienda: guarda con la hora de creación", async () => {
    const event = userCreated({ unsafe_metadata: { legalConsent: { terms: "2026-10-21", privacy: "2026-10-21", channel: "registro" } } });
    expect((await POST(signed(event))).status).toBe(200);
    const [row] = await records(event.data.id as string);
    expect(row).toMatchObject({ evidence: "unsafe_metadata", termsVersion: "2026-10-21" });
    expect(row.consentedAt.getTime()).toBe(1792630000000);
  });

  it("sin prueba (cuenta del panel creada por invitación, versión desconocida): no guarda nada", async () => {
    for (const event of [userCreated(), userCreated({ unsafe_metadata: { legalConsent: { terms: "2099-01-01", privacy: "2026-10-21" } } })]) {
      const response = await POST(signed(event));
      expect(await response.json()).toEqual({ ok: true, recorded: false });
      expect(await records(event.data.id as string)).toHaveLength(0);
    }
  });

  it("idempotente: el mismo mensaje dos veces, u otro mensaje del mismo usuario, deja un solo registro", async () => {
    const event = userCreated({ legal_accepted_at: 1792630123000 });
    const id = `msg_${randomUUID()}`;
    expect(await (await POST(signed(event, { id }))).json()).toEqual({ ok: true, recorded: true });
    expect(await (await POST(signed(event, { id }))).json()).toEqual({ ok: true, recorded: false });
    expect(await (await POST(signed(event))).json()).toEqual({ ok: true, recorded: false });
    expect(await records(event.data.id as string)).toHaveLength(1);
  });

  it("firma inválida, de otro secreto o sin firma: 400 y nada guardado; otros eventos se ignoran; sin secreto, 503", async () => {
    const event = userCreated({ legal_accepted_at: 1792630123000 });
    const forged = await POST(signed(event, { secret: "whsec_b3Ryby1zZWNyZXRvLWRpc3RpbnRvLWRlLXBydWViYQ==" }));
    expect(forged.status).toBe(400);
    const unsigned = await POST(new Request("http://admin.test/api/webhook/clerk", { method: "POST", body: JSON.stringify(event) }));
    expect(unsigned.status).toBe(400);
    expect(await records(event.data.id as string)).toHaveLength(0);

    const updated = await POST(signed({ ...event, type: "user.updated" }));
    expect(await updated.json()).toEqual({ ok: true, ignored: true });
    expect(await records(event.data.id as string)).toHaveLength(0);

    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "");
    expect((await POST(signed(event))).status).toBe(503);
  });
});
