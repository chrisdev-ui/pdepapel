import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { MercadoLibreHealthSummary } from "@/emails/mercadolibre-health-summary";

const props = {
  generatedAt: "domingo, 6 de septiembre de 2026, 10:57 a. m.",
  totalIssues: 5,
  dashboardUrl: "https://admin.example.com/store-1/mercadolibre",
  metrics: {
    unansweredQuestions: 1,
    shipmentsToDispatch: 0,
    claimsRequiringAttention: 0,
    activeListings: 12,
    totalListings: 15,
  },
  groups: [
    {
      kind: "question",
      title: "Preguntas sin responder",
      description: "Una respuesta rápida suele convertir la pregunta en venta.",
      items: [
        {
          title: "Termo Owala 710ml",
          detail: "¿Tienen en color lila?",
          actions: [
            {
              label: "Responder",
              href: "https://admin.example.com/store-1/mercadolibre#mercadolibre-operations",
              primary: true,
            },
          ],
        },
      ],
      hidden: 0,
    },
    {
      kind: "stock_risk",
      title: "Stock en riesgo",
      description: "El stock local ya alcanzó el colchón de seguridad.",
      items: [
        {
          title: "Termo Tipo Owala Freesip 710ml Negro",
          detail: "Stock local 0; el colchón de seguridad es 0.",
          actions: [
            {
              label: "Ajustar stock",
              href: "https://admin.example.com/store-1/productos/product-1",
              primary: true,
            },
            {
              label: "Ver en Mercado Libre",
              href: "https://articulo.mercadolibre.com.co/MCO-123",
            },
          ],
        },
      ],
      hidden: 3,
    },
  ],
  hiddenIssues: 3,
};

describe("Mercado Libre health summary email", () => {
  it("groups pending reviews with a direct action for each case", async () => {
    const html = await render(<MercadoLibreHealthSummary {...props} />);

    expect(html).toContain("5 revisiones pendientes");
    expect(html).toContain("No es una venta nueva.");
    expect(html).toContain("Preguntas sin responder");
    expect(html).toContain("Envíos por despachar");
    expect(html).toContain("Reclamos por revisar");
    expect(html.replace(/<!-- -->/g, "")).toContain("Publicaciones activas: 12 de 15");
    expect(html).toContain("Stock en riesgo");
    expect(html).toContain("Termo Tipo Owala Freesip 710ml Negro");
    expect(html).toContain('href="https://admin.example.com/store-1/productos/product-1"');
    expect(html).toContain('href="https://articulo.mercadolibre.com.co/MCO-123"');
    expect(html).toContain(
      'href="https://admin.example.com/store-1/mercadolibre#mercadolibre-operations"',
    );
    expect(html).toContain("3 casos más de este tipo en Administración.");
    expect(html).toContain("Abrir Mercado Libre en Administración");
    expect(html.replace(/<!-- -->/g, "")).toContain(
      "los 3 casos que no caben en este correo",
    );
  });

  it("uses singular wording for a single pending review", async () => {
    const html = await render(
      <MercadoLibreHealthSummary
        {...props}
        totalIssues={1}
        groups={[{ ...props.groups[0] }]}
        hiddenIssues={0}
      />,
    );

    expect(html).toContain("1 revisión pendiente");
    expect(html).not.toContain("que no caben en este correo");
  });
});
