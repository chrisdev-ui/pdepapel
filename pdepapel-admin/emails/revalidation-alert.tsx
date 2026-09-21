import {
  CardText,
  Foot,
  KeyValues,
  Meta,
  P,
  PanelShell,
  SectionLabel,
  StickerCard,
  Title,
} from "./components";

interface RevalidationAlertProps {
  /** Ya formateada en hora de Bogotá por quien envía. */
  generatedAt: string;
  endpoints: string[];
  details: string[];
}

/**
 * La alerta de que la tienda no se refrescó.
 *
 * Hasta ahora salía como texto plano sin plantilla: la única de las catorce
 * que no tenía cara. Llega a Paula y a Christian, así que va en la piel
 * «panel», y el tinte es el único caso donde se usa `alert` —esto sí es algo
 * que hay que mirar hoy.
 */
export function RevalidationAlert({
  generatedAt,
  endpoints,
  details,
}: RevalidationAlertProps) {
  return (
    <PanelShell
      preview="La tienda en línea no se actualizó"
      tint="alert"
      label="Panel · alerta"
    >
      <Title panel>La tienda no se actualizó</Title>
      <Meta>{generatedAt}</Meta>

      <StickerCard tint="alert" filled>
        <CardText>
          Cambiaste algo del catálogo y la tienda en línea no alcanzó a
          refrescarse. <strong>Lo que ve el cliente puede estar desactualizado.</strong>
        </CardText>
      </StickerCard>

      {endpoints.length > 0 ? (
        <>
          <SectionLabel tint="slate">Qué no respondió</SectionLabel>
          <StickerCard tint="slate">
            <KeyValues
              rows={endpoints.map((endpoint, index) => ({
                key: endpoint,
                value: details[index] ?? "Sin detalle",
              }))}
            />
          </StickerCard>
        </>
      ) : null}

      {details.length > endpoints.length ? (
        <>
          <SectionLabel tint="slate">Detalles</SectionLabel>
          <StickerCard tint="slate">
            <CardText>{details.slice(endpoints.length).join("\n")}</CardText>
          </StickerCard>
        </>
      ) : null}

      <P>
        Esta alerta se limita a una por hora. Revisa los registros de Vercel
        para encontrar la causa.
      </P>

      <Foot>Panel de P de Papel · aviso automático</Foot>
    </PanelShell>
  );
}

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
RevalidationAlert.PreviewProps = {
  generatedAt: "domingo, 21 de septiembre de 2026, 11:25",
  endpoints: ["https://papeleriapdepapel.com/api/revalidate"],
  details: ["503 · la tienda no respondió a tiempo"],
} satisfies RevalidationAlertProps;

export default RevalidationAlert;
