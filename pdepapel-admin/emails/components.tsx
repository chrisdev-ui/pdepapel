/**
 * Las piezas compartidas de los correos.
 *
 * `theme.ts` tiene los estilos; aquí está el JSX que se repetía en las nueve
 * plantillas. La regla es que una plantilla solo escriba su contenido: la
 * cáscara, la mascota, el pie y la tabla de productos salen de aquí, y así
 * un ajuste de diseño se hace en un archivo y no en nueve.
 *
 * El `export default` de abajo no es un correo que se envíe: es el muestrario
 * que aparece en `npm run email:dev` para revisar los componentes sin tener
 * que abrir una plantilla real.
 */
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

import {
  LOGO_URL,
  Tint,
  band,
  body,
  bodyPanel,
  button,
  buttonGhost,
  buttonSection,
  card,
  cardText,
  container,
  cover,
  divider,
  footer,
  footerLink,
  h1,
  h1Panel,
  itemCell,
  itemName,
  itemPrice,
  itemQty,
  itemsTable,
  kvKey,
  kvValue,
  labelDot,
  main,
  mascot,
  meta,
  metricCell,
  metricLabel,
  metricValue,
  palette,
  panelDot,
  panelLabel,
  paragraph,
  pill,
  productCell,
  productImage,
  productName,
  productPrice,
  rule,
  sectionLabel,
  tagline,
  ticket,
  ticketCode,
  ticketHint,
  ticketLabel,
  tints,
  totalCell,
} from "./theme";

/* ------------------------------------------------------------- cáscaras */

interface ShellProps {
  preview: string;
  /** El tinte de la franja. Los pedidos la dejan rosa siempre. */
  tint?: Tint;
  /** El rótulo bajo la mascota: «Boletín», «Papelería · Medellín». */
  kicker?: string;
  children: React.ReactNode;
}

/** La piel «tienda»: la que ve un cliente. */
export function Shell({ preview, tint = "pink", kicker, children }: ShellProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={band(tint)}>
            <Img
              src={LOGO_URL}
              width="104"
              height="104"
              alt="P de Papel"
              style={mascot}
            />
            {kicker ? <Text style={tagline(tint)}>{kicker}</Text> : null}
          </Section>
          <Section style={body}>{children}</Section>
        </Container>
      </Body>
    </Html>
  );
}

interface PanelShellProps {
  preview: string;
  tint?: Tint;
  /** Lo que dice la regla de arriba: «Panel · Mercado Libre». */
  label: string;
  children: React.ReactNode;
}

/** La piel «panel»: la que ve Paula. Sin mascota, a propósito. */
export function PanelShell({
  preview,
  tint = "slate",
  label,
  children,
}: PanelShellProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={rule(tint)} />
          <Text style={panelLabel}>
            <span style={panelDot(tint)} />
            {label}
          </Text>
          <Section style={bodyPanel}>{children}</Section>
        </Container>
      </Body>
    </Html>
  );
}

/* --------------------------------------------------------------- piezas */

export function Title({
  children,
  panel = false,
}: {
  children: React.ReactNode;
  panel?: boolean;
}) {
  return <Heading style={panel ? h1Panel : h1}>{children}</Heading>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <Text style={paragraph}>{children}</Text>;
}

/** La línea de contexto bajo el título: fecha, número de pedido. */
export function Meta({ children }: { children: React.ReactNode }) {
  return <Text style={meta}>{children}</Text>;
}

/** El estado, como calcomanía. Reemplaza la banda de color a todo el ancho. */
export function Pill({ tint, children }: { tint: Tint; children: React.ReactNode }) {
  return <Text style={pill(tint)}>{children}</Text>;
}

/** El rótulo con su cuadradito de color, en vez de un emoji. */
export function SectionLabel({
  tint,
  children,
}: {
  tint: Tint;
  children: React.ReactNode;
}) {
  return (
    <Text style={sectionLabel}>
      <span style={labelDot(tint)} />
      {children}
    </Text>
  );
}

export function StickerCard({
  tint,
  filled = false,
  children,
}: {
  tint: Tint;
  filled?: boolean;
  children: React.ReactNode;
}) {
  return <Section style={card(tint, filled)}>{children}</Section>;
}

/** El párrafo que va dentro de una tarjeta. */
export function CardText({ children }: { children: React.ReactNode }) {
  return <Text style={cardText}>{children}</Text>;
}

export function Cta({
  href,
  ghost = false,
  children,
}: {
  href: string;
  ghost?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Section style={buttonSection}>
      <Button href={href} style={ghost ? buttonGhost : button}>
        {children}
      </Button>
    </Section>
  );
}

/* ------------------------------------------------------------ productos */

export interface EmailLineItem {
  name: string;
  quantity: number;
  /** Ya formateado en pesos. Puede faltar en pedidos viejos. */
  price?: string | null;
}

/**
 * La lista de compra, como filas de verdad.
 *
 * Antes era una cadena con viñetas pintada en Courier dentro de una caja
 * gris: lo que más le importa al cliente estaba tipografiado como un registro
 * de servidor.
 */
export function ItemsTable({
  items,
  total,
}: {
  items: EmailLineItem[];
  total?: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <table style={itemsTable} cellPadding={0} cellSpacing={0} role="presentation">
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.name}-${index}`}>
              <td style={itemCell}>
                <span style={itemName}>{item.name}</span>
                {item.quantity > 1 ? (
                  <span style={itemQty}>{`  ×${item.quantity}`}</span>
                ) : null}
              </td>
              {item.price ? <td style={itemPrice}>{item.price}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {total ? (
        <table
          style={{ ...itemsTable, marginTop: "4px" }}
          cellPadding={0}
          cellSpacing={0}
          role="presentation"
        >
          <tbody>
            <tr>
              <td style={totalCell}>Total</td>
              <td style={{ ...totalCell, textAlign: "right" as const }}>{total}</td>
            </tr>
          </tbody>
        </table>
      ) : null}
    </>
  );
}

export interface EmailProduct {
  name: string;
  imageUrl: string | null;
  url: string;
  price?: string | null;
}

/** Las tres tarjetas de producto del boletín, en el tinte del correo. */
export function ProductCards({
  products,
  tint = "pink",
}: {
  products: EmailProduct[];
  tint?: Tint;
}) {
  const shown = products.slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <Section style={{ margin: "2px 0 6px" }}>
      <Row>
        {shown.map((product) => (
          <Column key={product.url} style={productCell(tint)}>
            <Link
              href={product.url}
              style={{ color: palette.ink, textDecoration: "none" }}
            >
              {product.imageUrl ? (
                <Img
                  src={product.imageUrl}
                  width="150"
                  height="150"
                  alt=""
                  style={productImage}
                />
              ) : (
                <Section
                  style={{
                    ...productImage,
                    backgroundColor: tints[tint].pale,
                    height: "110px",
                  }}
                />
              )}
              <Text style={productName}>{product.name}</Text>
              {product.price ? (
                <Text style={productPrice}>{product.price}</Text>
              ) : null}
            </Link>
          </Column>
        ))}
      </Row>
    </Section>
  );
}

/* ------------------------------------------------------ cupón y tablas */

export function Ticket({
  label,
  code,
  hint,
}: {
  label: string;
  code: string;
  hint?: string | null;
}) {
  return (
    <Section style={ticket}>
      <Text style={ticketLabel}>{label}</Text>
      <Text style={ticketCode}>{code}</Text>
      {hint ? <Text style={ticketHint}>{hint}</Text> : null}
    </Section>
  );
}

/** Las filas densas de la piel panel. */
export function KeyValues({
  rows,
}: {
  rows: { key: string; value: React.ReactNode }[];
}) {
  if (rows.length === 0) return null;
  return (
    <table style={itemsTable} cellPadding={0} cellSpacing={0} role="presentation">
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.key}-${index}`}>
            <td style={kvKey}>{row.key}</td>
            <td style={kvValue}>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Metrics({
  items,
}: {
  items: { value: React.ReactNode; label: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <Section style={{ margin: "4px 0 6px" }}>
      <Row>
        {items.map((item) => (
          <Column key={item.label} style={metricCell}>
            <Text style={metricValue}>{item.value}</Text>
            <Text style={metricLabel}>{item.label}</Text>
          </Column>
        ))}
      </Row>
    </Section>
  );
}

/* ------------------------------------------------------------------ pie */

export function Foot({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Hr style={divider} />
      <Text style={footer}>{children}</Text>
    </>
  );
}

/** El enlace de baja: obligatorio en todo lo que salga del boletín. */
export function Unsubscribe({ url }: { url: string }) {
  return (
    <Link href={url} style={footerLink}>
      cancelar la suscripción
    </Link>
  );
}

export { cover };

/* --------------------------------------------------------- el muestrario */

/**
 * No se envía a nadie. Existe para que `npm run email:dev` liste una entrada
 * donde se ven todas las piezas juntas.
 */
export default function ComponentGallery() {
  return (
    <Shell preview="Muestrario de componentes" kicker="Muestrario">
      <Pill tint="mint">Pastilla de estado</Pill>
      <Title>Así se ve un título de correo</Title>
      <P>
        Y así un párrafo, con <strong>algo resaltado</strong> dentro para ver el
        contraste sobre blanco.
      </P>

      <SectionLabel tint="pink">Filas de producto</SectionLabel>
      <StickerCard tint="pink">
        <ItemsTable
          items={[
            { name: "Cuaderno cosido Osito", quantity: 2, price: "$ 36.000" },
            { name: "Set de micropuntas", quantity: 1, price: "$ 28.900" },
          ]}
          total="$ 64.900"
        />
      </StickerCard>

      <SectionLabel tint="blue">Tarjeta rellena</SectionLabel>
      <StickerCard tint="blue" filled>
        <CardText>Guía de envío · CO-4471 8820 11</CardText>
      </StickerCard>

      <Ticket
        label="Tu código"
        code="HOLA10"
        hint="10 % en tu primera compra · vence el 20 de diciembre"
      />

      <SectionLabel tint="slate">Clave y valor</SectionLabel>
      <StickerCard tint="slate">
        <KeyValues
          rows={[
            { key: "Cliente", value: "Luisa Sánchez" },
            { key: "Ciudad", value: "Medellín, Antioquia" },
          ]}
        />
      </StickerCard>

      <Metrics
        items={[
          { value: 4, label: "Preguntas sin responder" },
          { value: 2, label: "Envíos por despachar" },
          { value: 0, label: "Reclamos por revisar" },
        ]}
      />

      <Cta href="https://papeleriapdepapel.com">Botón principal</Cta>
      <Cta href="https://papeleriapdepapel.com" ghost>
        Botón de panel
      </Cta>

      <Foot>P de Papel · Medellín, Colombia</Foot>
    </Shell>
  );
}
