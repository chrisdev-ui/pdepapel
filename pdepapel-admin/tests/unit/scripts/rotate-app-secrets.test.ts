import { describe, expect, it } from "vitest";

import { APP_SECRETS, generateSecret, rotateAppSecrets } from "../../../scripts/rotation/rotate-app-secrets.mjs";

describe("rotación de secretos propios", () => {
  it("un mismo valor nuevo llega por stdin a cada consumidor del secreto, nunca en los argumentos ni en la salida", () => {
    const calls: { args: string[]; value: string; cwd?: string }[] = [];
    const lines: string[] = [];
    const results = rotateAppSecrets(["CRON_SECRET", "REVALIDATION_SECRET"], {
      run: (call: { args: string[]; value: string; cwd?: string }) => {
        calls.push(call);
        return { ok: true, detail: "" };
      },
      log: (line: string) => lines.push(line),
    });
    expect(results).toEqual([
      { name: "CRON_SECRET", ok: true, failed: [] },
      { name: "REVALIDATION_SECRET", ok: true, failed: [] },
    ]);
    const [cronVercel, cronGithub, revalAdmin, revalStore] = calls;
    expect(cronVercel.value).toBe(cronGithub.value);
    expect(revalAdmin.value).toBe(revalStore.value);
    expect(cronVercel.value).not.toBe(revalAdmin.value);
    expect(cronGithub.args).toEqual(["secret", "set", "PDEPAPEL_ADMIN_CRON_SECRET", "-R", "chrisdev-ui/pdepapel"]);
    expect(revalAdmin.args).toEqual(["env", "update", "REVALIDATION_SECRET", "production", "--sensitive", "-y"]);
    expect(revalAdmin.cwd).toMatch(/pdepapel-admin$/);
    expect(revalStore.cwd).toMatch(/pdepapel-store$/);
    for (const call of calls) {
      expect(call.args.join(" ")).not.toContain(call.value);
      expect(lines.join("\n")).not.toContain(call.value);
    }
  });

  it("si un consumidor falla, el secreto queda incompleto y se dice cuál", () => {
    const results = rotateAppSecrets(["CRON_SECRET"], {
      run: (call: { command: string }) => (call.command === "gh" ? { ok: false, detail: "sin permiso" } : { ok: true, detail: "" }),
      log: () => {},
    });
    expect(results).toEqual([{ name: "CRON_SECRET", ok: false, failed: ["GitHub PDEPAPEL_ADMIN_CRON_SECRET"] }]);
  });

  it("solo incluye secretos que viven únicamente en Production y genera 64 caracteres hex", () => {
    expect(Object.keys(APP_SECRETS).sort()).toEqual(["CRON_SECRET", "GOOGLE_MERCHANT_FEED_SECRET", "NEWSLETTER_EARLY_ACCESS_SECRET", "REVALIDATION_SECRET"]);
    expect(generateSecret()).toMatch(/^[0-9a-f]{64}$/);
    expect(() => rotateAppSecrets(["INTERNAL_API_SECRET"], { run: () => ({ ok: true, detail: "" }), log: () => {} })).toThrow(/desconocido/);
  });
});
