import {
  CardText,
  Cta,
  Foot,
  KeyValues,
  Meta,
  PanelShell,
  SectionLabel,
  StickerCard,
  Title,
} from "./components";

type MercadoLibreOrderNotificationProps = {
  buyerName: string | null;
  inventoryStatus: string;
  orderNumber: string;
  orderSummary: string;
  orderUrl: string;
  netAmount: string | null;
  paidAt: string | null;
};

const inventoryLabels: Record<string, string> = {
  DECREMENTED: "Inventario descontado y sincronizado",
  EXCEPTION: "Requiere revisión de inventario",
  NOT_APPLIED: "Pendiente de aplicar al inventario",
  RESTOCK_PENDING: "Pendiente de devolución física",
};

export function MercadoLibreOrderNotification({
  buyerName,
  inventoryStatus,
  orderNumber,
  orderSummary,
  orderUrl,
  netAmount,
  paidAt,
}: MercadoLibreOrderNotificationProps) {
  const inventoryLabel =
    inventoryLabels[inventoryStatus] ?? "Venta registrada en el panel";

  /* La línea se arma en JS, no interpolada en el JSX: React mete un comentario
     entre cada trozo y partiría la frase en el HTML final. */
  const netLine = netAmount
    ? `Neto de la venta: ${netAmount}`
    : "Liquidación neta: pendiente de Mercado Libre";
  const metaLine = `Venta #${orderNumber} · ${netLine}`;

  const rows: { key: string; value: React.ReactNode }[] = [
    { key: "Comprador", value: buyerName ?? "No disponible" },
  ];
  if (paidAt) rows.push({ key: "Pago confirmado", value: paidAt });
  rows.push({
    key: "Origen del aviso",
    value: "Mercado Libre confirmó el pago",
  });
  rows.push({ key: "Vínculo en P de Papel", value: inventoryLabel });

  return (
    <PanelShell
      preview={`Venta pagada y registrada de Mercado Libre #${orderNumber}`}
      tint="yellow"
      label="Panel · Mercado Libre"
    >
      <Title panel>Venta pagada y registrada</Title>
      <Meta>{metaLine}</Meta>

      <StickerCard tint="slate">
        <KeyValues rows={rows} />
      </StickerCard>

      {netAmount === null ? (
        <StickerCard tint="yellow" filled>
          <CardText>
            <strong>Liquidación pendiente.</strong> Mercado Libre todavía no
            publicó el valor neto. P de Papel lo actualizará solo, sin tocar el
            inventario ni esta venta.
          </CardText>
        </StickerCard>
      ) : null}

      <SectionLabel tint="slate">Productos vinculados</SectionLabel>
      <StickerCard tint="slate">
        <CardText>{orderSummary}</CardText>
      </StickerCard>

      <Cta href={orderUrl} ghost>
        Ver la venta en el panel
      </Cta>

      <Foot>
        Panel de P de Papel · los cambios de envío no generan este correo.
      </Foot>
    </PanelShell>
  );
}

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
MercadoLibreOrderNotification.PreviewProps = {
  buyerName: "andrea.mv",
  inventoryStatus: "DECREMENTED",
  orderNumber: "2000018407778482",
  orderSummary: "• 1 × Termo Owala 710ml (TERMO-OWALA-01)",
  orderUrl: "https://admin.papeleriapdepapel.com/demo/mercadolibre",
  netAmount: null,
  paidAt: "15 de septiembre de 2026, 8:17 p. m.",
} satisfies MercadoLibreOrderNotificationProps;

export default MercadoLibreOrderNotification;
