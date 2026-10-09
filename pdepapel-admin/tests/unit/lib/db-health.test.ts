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
  container: { ok: true as const, currentGb: 0.5, limitGb: 8, dayAgoGb: 0.45, growthGb: 0.05, at: new Date("2026-10-10T12:55:00Z") },
};

describe("judgeDbHealth", () => {
  it("todo en orden: sin aviso y con los números que importan", () => {
    const verdict = judgeDbHealth(healthy);
    expect(verdict.alert).toBe(false);
    expect(verdict.warnings).toEqual([]);
    expect(verdict.detail).toBe("Memoria contada por MySQL: 600 MB de 8192 MB (7 %). Contenedor en Railway: 512 MB (+51 MB en 24 h). Conexiones: 33 de 200 (pico 48). Encendida hace 3 días.");
    expect(verdict.containerAlert).toBe(false);
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

describe("memoria del contenedor en Railway", () => {
  const container = (currentGb: number, growthGb: number | null) => ({ ok: true as const, currentGb, limitGb: 8, dayAgoGb: growthGb === null ? null : currentGb - growthGb, growthGb, at: new Date() });

  it("en rojo y con correo por encima de 2 GB", () => {
    const verdict = judgeDbHealth({ ...healthy, container: container(2.3, 0.1) });
    expect(verdict.alert).toBe(true);
    expect(verdict.containerAlert).toBe(true);
    expect(verdict.warnings[0]).toBe("El contenedor de MySQL usa 2355 MB, más de los 2048 MB que se esperan.");
  });

  it("en rojo y con correo si creció más de 300 MB en 24 h", () => {
    const verdict = judgeDbHealth({ ...healthy, container: container(1.2, 0.4) });
    expect(verdict.containerAlert).toBe(true);
    expect(verdict.warnings[0]).toBe("El contenedor de MySQL creció 410 MB en 24 h (de 819 MB a 1229 MB).");
  });

  it("sin dato de hace 24 h solo muestra el valor actual", () => {
    const verdict = judgeDbHealth({ ...healthy, container: container(0.5, null) });
    expect(verdict.alert).toBe(false);
    expect(verdict.detail).toContain("Contenedor en Railway: 512 MB.");
  });

  it("sin lectura de Railway no falla ni se pone en rojo, y lo dice", () => {
    const verdict = judgeDbHealth({ ...healthy, container: { ok: false, reason: "sin lectura de Railway (falta RAILWAY_METRICS_TOKEN)" } });
    expect(verdict.alert).toBe(false);
    expect(verdict.containerAlert).toBe(false);
    expect(verdict.detail).toContain("Contenedor: sin lectura de Railway (falta RAILWAY_METRICS_TOKEN).");
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
