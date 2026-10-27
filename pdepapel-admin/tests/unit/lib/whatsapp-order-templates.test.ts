import { describe, expect, it } from "vitest";

import { templateNameFor } from "@/lib/shipment-notifications";
import { buildOrderUpdateTemplate, missingTemplateParams } from "@/lib/whatsapp-order-templates";

const names = {
  whatsappTemplateGuide: "guia_creada",
  whatsappTemplateDelivered: "pedido_entregado",
  whatsappTemplateInTransit: "pedido_en_transito",
  whatsappTemplateOutForDelivery: " pedido_en_reparto ",
  whatsappTemplateIssue: "",
};

describe("plantillas de avisos de envío", () => {
  it("cada hito tiene su plantilla; vacía = solo correo", () => {
    expect(templateNameFor("guia_creada", names)).toBe("guia_creada");
    expect(templateNameFor("en_camino", names)).toBe("pedido_en_transito");
    expect(templateNameFor("en_reparto", names)).toBe("pedido_en_reparto");
    expect(templateNameFor("entregado", names)).toBe("pedido_entregado");
    expect(templateNameFor("novedad", names)).toBeNull();
  });

  it("guía creada lleva cuatro datos y el resto dos, con el botón al pedido", () => {
    const order = { id: "ord-1", orderNumber: "ORD-9", fullName: "  Ana María Pérez", shipping: { trackingCode: "TRK1", carrierName: "ENVIA", courier: null } };
    expect(buildOrderUpdateTemplate("guia_creada", "guia_creada", order)).toEqual({
      name: "guia_creada",
      language: "es_CO",
      bodyParams: ["Ana", "ORD-9", "ENVIA", "TRK1"],
      buttonUrlSuffix: "ord-1",
    });
    expect(buildOrderUpdateTemplate("pedido_novedad", "novedad", order).bodyParams).toEqual(["Ana", "ORD-9"]);
  });

  it("dice qué dato falta", () => {
    expect(missingTemplateParams("guia_creada", ["Ana", "ORD-9", "ENVIA", ""])).toEqual(["{{4}} número de guía"]);
    expect(missingTemplateParams("en_camino", ["Ana", " "])).toEqual(["{{2}} número de pedido"]);
    expect(missingTemplateParams("entregado", ["Ana", "ORD-9"])).toEqual([]);
  });
});
