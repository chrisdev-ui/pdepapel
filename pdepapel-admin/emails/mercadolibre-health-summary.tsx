import { Link, Section, Text } from "@react-email/components";

import {
  CardText,
  Cta,
  Foot,
  KeyValues,
  Meta,
  Metrics,
  PanelShell,
  SectionLabel,
  StickerCard,
  Title,
} from "./components";
import { fonts, palette, paragraph } from "./theme";

export type MercadoLibreHealthSummaryAction = {
  label: string;
  href: string;
  primary?: boolean;
};

export type MercadoLibreHealthSummaryItem = {
  title: string;
  detail: string;
  actions: MercadoLibreHealthSummaryAction[];
};

export type MercadoLibreHealthSummaryGroup = {
  kind: string;
  title: string;
  description: string;
  items: MercadoLibreHealthSummaryItem[];
  hidden: number;
};

export type MercadoLibreHealthSummaryProps = {
  generatedAt: string;
  totalIssues: number;
  dashboardUrl: string;
  metrics: {
    unansweredQuestions: number;
    shipmentsToDispatch: number;
    claimsRequiringAttention: number;
    activeListings: number;
    totalListings: number;
  };
  groups: MercadoLibreHealthSummaryGroup[];
  hiddenIssues: number;
};

/**
 * El resumen diario de Mercado Libre.
 *
 * Este llega **todos los días**. Por eso va en la piel «panel» y no lleva
 * mascota: lo que se necesita es leerlo en dos segundos desde el teléfono,
 * no que sea bonito. Los tres números de arriba son la respuesta; el resto
 * es el detalle para quien quiera bajar.
 */
export function MercadoLibreHealthSummary({
  generatedAt,
  totalIssues,
  dashboardUrl,
  metrics,
  groups,
  hiddenIssues,
}: MercadoLibreHealthSummaryProps) {
  const headline =
    totalIssues === 1
      ? "1 revisión pendiente"
      : `${totalIssues} revisiones pendientes`;

  return (
    <PanelShell
      preview={`Mercado Libre: ${headline}. No es una venta nueva.`}
      tint="yellow"
      label="Panel · Mercado Libre · revisión diaria"
    >
      <Title panel>{headline}</Title>
      <Meta>{generatedAt}</Meta>

      <StickerCard tint="yellow" filled>
        <CardText>
          <strong>No es una venta nueva.</strong> Es el chequeo automático de la
          cuenta, una vez al día, con un acceso directo por cada caso.
        </CardText>
      </StickerCard>

      <Metrics
        items={[
          { value: metrics.unansweredQuestions, label: "Preguntas sin responder" },
          { value: metrics.shipmentsToDispatch, label: "Envíos por despachar" },
          {
            value: metrics.claimsRequiringAttention,
            label: "Reclamos por revisar",
          },
        ]}
      />

      <Text style={listingsLine}>
        Publicaciones activas: {metrics.activeListings} de {metrics.totalListings}
      </Text>

      {groups.map((group) => (
        <Section key={group.kind}>
          <SectionLabel tint="slate">
            {group.title} ({group.items.length + group.hidden})
          </SectionLabel>
          <Text style={groupDescription}>{group.description}</Text>

          <StickerCard tint="slate">
            <KeyValues
              rows={group.items.map((item) => ({
                key: item.title,
                value: (
                  <>
                    {item.detail}
                    {item.actions.length > 0 ? <br /> : null}
                    {item.actions.map((action, actionIndex) => (
                      <Link
                        key={`${action.href}-${actionIndex}`}
                        href={action.href}
                        style={action.primary ? primaryAction : secondaryAction}
                      >
                        {action.label}
                      </Link>
                    ))}
                  </>
                ),
              }))}
            />
            {group.hidden > 0 ? (
              <Text style={hiddenText}>
                {group.hidden === 1
                  ? "1 caso más de este tipo en Administración."
                  : `${group.hidden} casos más de este tipo en Administración.`}
              </Text>
            ) : null}
          </StickerCard>
        </Section>
      ))}

      <Cta href={dashboardUrl} ghost>
        Abrir Mercado Libre en Administración
      </Cta>

      {hiddenIssues > 0 ? (
        <Text style={hiddenSummary}>
          Allí verás los {hiddenIssues} casos que no caben en este correo.
        </Text>
      ) : null}

      <Foot>
        Recibes este correo una vez al día mientras haya revisiones pendientes.
        Si ya resolviste todo, mañana no llegará.
      </Foot>
    </PanelShell>
  );
}

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
MercadoLibreHealthSummary.PreviewProps = {
  generatedAt: "domingo, 21 de septiembre de 2026, 11:25 a. m.",
  totalIssues: 6,
  dashboardUrl: "https://admin.papeleriapdepapel.com/demo/mercadolibre",
  metrics: {
    unansweredQuestions: 4,
    shipmentsToDispatch: 2,
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
        { title: "Termo Owala 710ml", detail: "¿Tienen en color lila?", actions: [{ label: "Responder", href: "https://admin.papeleriapdepapel.com/demo/mercadolibre", primary: true }] },
      ],
      hidden: 3,
    },
    {
      kind: "stock_risk",
      title: "Stock en riesgo",
      description: "El stock local ya alcanzó el colchón de seguridad.",
      items: [
        { title: "Cuaderno cosido Osito", detail: "Stock local 0; el colchón de seguridad es 0.", actions: [{ label: "Ajustar stock", href: "https://admin.papeleriapdepapel.com/demo/productos/1", primary: true }, { label: "Ver en Mercado Libre", href: "https://articulo.mercadolibre.com.co/MCO-123" }] },
      ],
      hidden: 0,
    },
  ],
  hiddenIssues: 3,
} satisfies MercadoLibreHealthSummaryProps;

export default MercadoLibreHealthSummary;

const listingsLine = {
  ...paragraph,
  color: palette.inkMuted,
  fontSize: "13px",
  margin: "2px 0 4px",
} as const;

const groupDescription = {
  ...paragraph,
  fontSize: "13.5px",
  margin: "0 0 9px",
} as const;

const actionBase = {
  fontFamily: fonts.body,
  fontSize: "13px",
  fontWeight: 700,
  marginRight: "12px",
  textDecoration: "underline",
} as const;

const primaryAction = { ...actionBase, color: palette.berry } as const;
const secondaryAction = { ...actionBase, color: palette.inkMuted } as const;

const hiddenText = {
  ...paragraph,
  color: palette.inkMuted,
  fontSize: "12.5px",
  margin: "9px 0 0",
} as const;

const hiddenSummary = {
  ...paragraph,
  color: palette.inkMuted,
  fontSize: "12.5px",
  margin: "6px 0 0",
  textAlign: "center" as const,
} as const;
