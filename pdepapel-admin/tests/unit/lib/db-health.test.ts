import { describe, expect, it, vi } from "vitest";

import { judgeDbHealth, readDbHealth, resolveDbMemoryLimitMb } from "@/lib/db-health";

const MB = 1024 * 1024;
const healthy = {
  trackedBytes: 600 * MB,
  limitMb: 8192,
  threadsConnected: 33,
  maxUsedConnections: 48,
  maxConnections: 200,
  uptimeSeconds: 3 * 24 * 3600,
  pendingWhatsAppReplays: 0,
};

describe("judgeDbHealth", () => {
  it("todo en orden: sin aviso y con los números que importan", () => {
    const verdict = judgeDbHealth(healthy);
    expect(verdict.alert).toBe(false);
    expect(verdict.warnings).toEqual([]);
    expect(verdict.detail).toBe("Memoria contada por MySQL: 600 MB de 8192 MB (7 %). Conexiones: 33 de 200 (pico 48). Encendida hace 3 días.");
  });

  it("avisa desde el 70 % de la memoria", () => {
    const verdict = judgeDbHealth({ ...healthy, trackedBytes: 5800 * MB });
    expect(verdict.alert).toBe(true);
    expect(verdict.warnings[0]).toContain("71 %");
  });

  it("avisa desde el 70 % de las conexiones, ahora o en el pico", () => {
    expect(judgeDbHealth({ ...healthy, threadsConnected: 140 }).alert).toBe(true);
    expect(judgeDbHealth({ ...healthy, maxUsedConnections: 150 }).warnings[0]).toContain("pico de 150 de 200");
  });

  it("un reinicio en las últimas 24 h se ve a la mañana siguiente", () => {
    const verdict = judgeDbHealth({ ...healthy, uptimeSeconds: 5 * 3600 });
    expect(verdict.alert).toBe(true);
    expect(verdict.warnings[0]).toBe("MySQL se reinició hace 5 h. Si no fue un reinicio planeado, revisa la memoria del servicio en Railway.");
  });

  it("avisa si quedan eventos de WhatsApp sin guardar", () => {
    expect(judgeDbHealth({ ...healthy, pendingWhatsAppReplays: 2 }).warnings).toEqual([
      "2 eventos de WhatsApp siguen esperando reintento: la base no los pudo guardar.",
    ]);
  });
});

describe("resolveDbMemoryLimitMb", () => {
  it("toma DB_MEMORY_LIMIT_MB y si no, 8192", () => {
    expect(resolveDbMemoryLimitMb({ DB_MEMORY_LIMIT_MB: "4096" })).toBe(4096);
    expect(resolveDbMemoryLimitMb({})).toBe(8192);
    expect(resolveDbMemoryLimitMb({ DB_MEMORY_LIMIT_MB: "nada" })).toBe(8192);
  });
});

describe("readDbHealth", () => {
  it("lee memoria, estado y límite de conexiones con tres consultas", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("memory_summary_global_by_event_name")) return [{ bytes: BigInt(600 * MB) }];
      if (sql.includes("GLOBAL STATUS"))
        return [
          { Variable_name: "Uptime", Value: "259200" },
          { Variable_name: "Threads_connected", Value: "33" },
          { Variable_name: "Max_used_connections", Value: "48" },
        ];
      return [{ max: BigInt(200) }];
    });
    await expect(readDbHealth({ $queryRawUnsafe: query } as never)).resolves.toEqual({
      trackedBytes: 600 * MB,
      uptimeSeconds: 259200,
      threadsConnected: 33,
      maxUsedConnections: 48,
      maxConnections: 200,
    });
    expect(query).toHaveBeenCalledTimes(3);
  });
});
