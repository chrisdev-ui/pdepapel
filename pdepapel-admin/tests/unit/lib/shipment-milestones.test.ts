import { ShippingStatus as S } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { mapEnvioClickStatus } from "@/lib/shipment-status";
import { milestoneForStatus, milestoneNotifiesAdmin, milestoneStillCurrent, nextShipmentStatus } from "@/lib/shipment-milestones";

/** Recorre eventos crudos de EnvioClick como lo hace el webhook y devuelve los hitos avisados. */
function replay(start: S, rawEvents: string[]) {
  let current = start;
  const notified: string[] = [];
  for (const raw of rawEvents) {
    const next = nextShipmentStatus(current, mapEnvioClickStatus(raw, current));
    if (next !== current) {
      const milestone = milestoneForStatus(next);
      if (milestone) notified.push(milestone);
      current = next;
    }
  }
  return { final: current, notified };
}

describe("nextShipmentStatus", () => {
  it("«Pendiente de recolección» después de crear la guía no devuelve el envío a Preparando ni avisa", () => {
    expect(replay(S.Shipped, ["Pendiente de recolección"])).toEqual({ final: S.Shipped, notified: [] });
  });

  it("secuencia real 2026-09/10: guía, en tránsito, entregado (sin «En reparto»)", () => {
    expect(replay(S.Shipped, ["Pendiente de recolección", "En tránsito", "Entregado"])).toEqual({
      final: S.Delivered,
      notified: ["en_camino", "entregado"],
    });
  });

  it("secuencia real: el primer evento ya es en tránsito", () => {
    expect(replay(S.Shipped, ["EN TRANSITO", "ENTREGADO"]).notified).toEqual(["en_camino", "entregado"]);
  });

  it("un evento viejo que llega tarde no hace retroceder", () => {
    expect(nextShipmentStatus(S.InTransit, S.PickedUp)).toBe(S.InTransit);
    expect(nextShipmentStatus(S.OutForDelivery, S.InTransit)).toBe(S.OutForDelivery);
  });

  it("entregado, cancelado y devuelto no se mueven más", () => {
    for (const terminal of [S.Delivered, S.Cancelled, S.Returned]) {
      expect(nextShipmentStatus(terminal, S.InTransit)).toBe(terminal);
      expect(nextShipmentStatus(terminal, S.Exception)).toBe(terminal);
    }
  });

  it("una novedad entra en cualquier paso y el envío sigue después", () => {
    expect(nextShipmentStatus(S.InTransit, S.FailedDelivery)).toBe(S.FailedDelivery);
    expect(nextShipmentStatus(S.FailedDelivery, S.OutForDelivery)).toBe(S.OutForDelivery);
    expect(nextShipmentStatus(S.Exception, S.Preparing)).toBe(S.Exception);
    expect(nextShipmentStatus(S.Exception, S.Delivered)).toBe(S.Delivered);
  });

  it("una guía hecha fuera del panel arranca en Preparando y avanza", () => {
    expect(replay(S.Preparing, ["Pendiente de recolección", "Recogido", "En reparto", "Entregado"]).notified).toEqual([
      "en_camino",
      "en_reparto",
      "entregado",
    ]);
  });
});

describe("hitos", () => {
  it("cada estado tiene su aviso y cancelado ninguno", () => {
    expect(milestoneForStatus(S.Shipped)).toBe("guia_creada");
    expect(milestoneForStatus(S.PickedUp)).toBe("en_camino");
    expect(milestoneForStatus(S.OutForDelivery)).toBe("en_reparto");
    expect(milestoneForStatus(S.Delivered)).toBe("entregado");
    expect(milestoneForStatus(S.Returned)).toBe("novedad");
    expect(milestoneForStatus(S.Cancelled)).toBeNull();
  });

  it("un aviso perdido se reintenta solo mientras el envío siga en ese paso", () => {
    expect(milestoneStillCurrent("guia_creada", S.Shipped)).toBe(true);
    expect(milestoneStillCurrent("guia_creada", S.InTransit)).toBe(false);
    expect(milestoneStillCurrent("en_camino", S.PickedUp)).toBe(true);
    expect(milestoneStillCurrent("entregado", S.Delivered)).toBe(true);
    expect(milestoneStillCurrent("novedad", S.Exception)).toBe(true);
    expect(milestoneStillCurrent("novedad", S.Delivered)).toBe(false);
    expect(milestoneStillCurrent("en_camino", null)).toBe(false);
  });

  it("Paula recibe copia solo de entregas y novedades", () => {
    expect(milestoneNotifiesAdmin("guia_creada")).toBe(false);
    expect(milestoneNotifiesAdmin("en_camino")).toBe(false);
    expect(milestoneNotifiesAdmin("entregado")).toBe(true);
    expect(milestoneNotifiesAdmin("novedad")).toBe(true);
  });
});
