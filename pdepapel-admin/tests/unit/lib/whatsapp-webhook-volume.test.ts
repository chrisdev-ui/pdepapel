import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_VOLUME_THRESHOLD,
  QSTASH_DAILY_CAP,
  judgeWebhookVolume,
  redactVolumeDetail,
  resolveVolumeThreshold,
  startOfBogotaDay,
} from "@/lib/whatsapp/webhook-volume";

/**
 * El aviso de volumen. Existe por lo del 21 de septiembre de 2026: el día
 * cerró en 1104 eventos, la cuota de QStash se agotó a media tarde y los
 * mensajes de clientas reales dejaron de procesarse en silencio. Nadie se
 * enteró hasta el día siguiente.
 */
describe("cuándo hay que avisar", () => {
  const juzgar = (total: number, threshold = DEFAULT_VOLUME_THRESHOLD) =>
    judgeWebhookVolume({ total, threshold });

  it("por debajo del umbral no avisa", () => {
    expect(juzgar(699).alert).toBe(false);
    expect(juzgar(0).alert).toBe(false);
  });

  it("avisa justo al llegar al umbral, no después", () => {
    expect(juzgar(700).alert).toBe(true);
  });

  it("sigue avisando por encima", () => {
    expect(juzgar(1104).alert).toBe(true);
  });

  /** El día que reventó: con este aviso habría saltado con 300 de margen. */
  it("el día del incidente habría avisado con margen", () => {
    const aviso = juzgar(700);
    expect(aviso.alert).toBe(true);
    expect(aviso.remaining).toBe(300);
  });

  it("pasado el tope, el margen es cero y no negativo", () => {
    expect(juzgar(1104).remaining).toBe(0);
  });

  it("el texto dice qué pasa y qué se puede hacer", () => {
    const { detail } = juzgar(800);
    expect(detail).toContain("800");
    expect(detail).toContain(String(QSTASH_DAILY_CAP));
    expect(detail).toContain("ignorar");
  });

  it("señala la conversación que más aporta solo con su id y su cuenta", () => {
    const { detail } = judgeWebhookVolume({
      total: 800,
      threshold: 700,
      topContact: { conversationId: "conv-123", count: 394 },
    });
    expect(detail).toContain("conv-123");
    expect(detail).toContain("394");
  });
});

describe("el aviso nunca lleva datos de la clienta", () => {
  it("la conversación que más aporta se busca sin leer nombre, teléfono ni BSUID", async () => {
    const conversationFindUnique = vi.fn();
    vi.doMock("@/lib/prismadb", () => ({
      default: {
        conversationMessage: { groupBy: vi.fn().mockResolvedValue([{ conversationId: "conv-123", _count: { _all: 41 } }]) },
        conversation: { findUnique: conversationFindUnique },
      },
    }));
    vi.resetModules();
    const { findTopContactToday, judgeWebhookVolume: judge } = await import("@/lib/whatsapp/webhook-volume");
    const top = await findTopContactToday(new Date("2026-10-14T18:00:00Z"));
    expect(top).toEqual({ conversationId: "conv-123", count: 41 });
    expect(conversationFindUnique).not.toHaveBeenCalled();
    const verdict = judge({ total: 800, threshold: 700, topContact: top });
    expect(Object.keys(top!).sort()).toEqual(["conversationId", "count"]);
    expect(verdict.detail).not.toMatch(/\+?\d{10,}/);
    vi.doUnmock("@/lib/prismadb");
  });
});

describe("el umbral configurable", () => {
  it("sin configurar usa el de por defecto", () => {
    expect(resolveVolumeThreshold({})).toBe(DEFAULT_VOLUME_THRESHOLD);
    expect(resolveVolumeThreshold({ WHATSAPP_WEBHOOK_DAILY_ALERT: "" })).toBe(DEFAULT_VOLUME_THRESHOLD);
    expect(resolveVolumeThreshold({ WHATSAPP_WEBHOOK_DAILY_ALERT: "no es un número" })).toBe(DEFAULT_VOLUME_THRESHOLD);
    expect(resolveVolumeThreshold({ WHATSAPP_WEBHOOK_DAILY_ALERT: "0" })).toBe(DEFAULT_VOLUME_THRESHOLD);
    expect(resolveVolumeThreshold({ WHATSAPP_WEBHOOK_DAILY_ALERT: "-50" })).toBe(DEFAULT_VOLUME_THRESHOLD);
  });

  it("respeta un valor puesto a mano", () => {
    expect(resolveVolumeThreshold({ WHATSAPP_WEBHOOK_DAILY_ALERT: "500" })).toBe(500);
  });

  /** Avisar por encima del tope no sirve: para entonces ya se cayó. */
  it("nunca deja poner un umbral por encima del tope del plan", () => {
    expect(resolveVolumeThreshold({ WHATSAPP_WEBHOOK_DAILY_ALERT: "5000" })).toBe(QSTASH_DAILY_CAP);
  });
});

describe("el día cuenta en hora de Bogotá", () => {
  it("la medianoche local no es la UTC", () => {
    // 2026-09-22 02:00 UTC siguen siendo las 21:00 del 21 en Bogotá.
    const inicio = startOfBogotaDay(new Date("2026-09-22T02:00:00.000Z"));
    expect(inicio.toISOString()).toBe("2026-09-21T05:00:00.000Z");
  });

  it("a media tarde el día es el que se espera", () => {
    const inicio = startOfBogotaDay(new Date("2026-09-21T20:00:00.000Z"));
    expect(inicio.toISOString()).toBe("2026-09-21T05:00:00.000Z");
  });
});

describe("limpieza de los avisos viejos", () => {
  it("quita el nombre o teléfono y deja solo la cuenta", () => {
    expect(redactVolumeDetail("188 eventos hoy, por debajo del aviso (700). El que más aporta hoy: Nombre De Prueba con 41.")).toBe(
      "188 eventos hoy, por debajo del aviso (700). La conversación que más aportaba sumaba 41 mensajes.",
    );
    expect(redactVolumeDetail("800 eventos hoy (aviso a partir de 700, tope del plan 1000). Quedan 200 antes de que se empiecen a perder mensajes. El que más aporta hoy: 573000000000 con 394. Si sobra volumen de un contacto, se puede ignorar desde su conversación.")).toBe(
      "800 eventos hoy (aviso a partir de 700, tope del plan 1000). Quedan 200 antes de que se empiecen a perder mensajes. La conversación que más aportaba sumaba 394 mensajes. Si sobra volumen de un contacto, se puede ignorar desde su conversación.",
    );
  });

  it("un nombre que contiene «con» se quita entero", () => {
    expect(redactVolumeDetail("10 eventos hoy, por debajo del aviso (700). El que más aporta hoy: Tienda con Amor con 7.")).toBe("10 eventos hoy, por debajo del aviso (700). La conversación que más aportaba sumaba 7 mensajes.");
  });

  it("lo que ya está limpio o vacío no se toca", () => {
    expect(redactVolumeDetail("10 eventos hoy, por debajo del aviso (700). La conversación que más aporta hoy suma 7 mensajes (id conv-1).")).toBeNull();
    expect(redactVolumeDetail(null)).toBeNull();
    expect(redactVolumeDetail("")).toBeNull();
  });
});

