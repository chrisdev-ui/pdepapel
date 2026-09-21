/**
 * La cara de P de Papel en el correo.
 *
 * Antes había tres paletas sueltas: el boletín en `#17152f`, los pedidos en
 * grises pizarra `#0f172a`, y reactivación con su propio rosa. Ninguna venía
 * de la tienda. Aquí se unifican con los tonos que el cliente ya ve en
 * `pdepapel-store/app/globals.css` —los `--kawaii-*`— para que un correo se
 * reconozca antes de leerlo.
 *
 * ## Dos pieles, un mismo esqueleto
 *
 * - **Tienda**: va a clientes. Franja pastel con la mascota, tarjetas con
 *   borde grueso, una sola acción clara.
 * - **Panel**: va a Paula y a Christian. Sin mascota; una regla de 7px y
 *   filas densas de clave/valor. El resumen de Mercado Libre llega **todos
 *   los días**: ahí lo bonito estorba, lo que importa es leerlo en dos
 *   segundos desde el teléfono.
 *
 * ## Reglas del medio, que no son las de la web
 *
 * - **Todo va en estilos en línea.** Gmail borra `<style>` y no hay variables
 *   CSS que valgan.
 * - **Nada de flex ni grid.** `@react-email/components` pinta tablas por
 *   debajo; el diseño se apoya en eso.
 * - **Nada de `box-shadow`.** Gmail lo quita. La sombra dura de la tienda
 *   (`0 4px 0`) se reconstruye con `borderBottomWidth: 4px`, que no puede
 *   quitar.
 * - **Contraste real.** El rosa de la marca `#F471B2` da 2,4:1 sobre blanco:
 *   no sirve para texto ni para un botón. `berry` es el mismo tono más
 *   oscuro y llega a 4,9:1. Sobre un pastel el texto siempre es `ink`.
 */

export const palette = {
  /** Rosa de la marca: `--kawaii-pink`. Solo para superficies, nunca texto. */
  pink: "#F471B2",
  pinkSoft: "#F9B8D9",
  pinkPale: "#FDE3F0",
  pinkInk: "#8E1F53",

  mint: "#99E5CC",
  mintPale: "#DEF7EF",
  mintInk: "#14624A",

  blue: "#8CD0F2",
  bluePale: "#DAF0FB",
  blueInk: "#14536F",

  yellow: "#FFDF80",
  yellowPale: "#FFF5D6",
  yellowInk: "#7A5400",

  lavender: "#D6ADEB",
  lavenderPale: "#F1E3F8",
  lavenderInk: "#5C2C72",

  peach: "#FFCCB3",
  peachPale: "#FFEDE4",
  peachInk: "#8A3D18",

  /** Gris de la piel «panel»: lo interno no lleva color de marca. */
  slate: "#C3CAD9",
  slatePale: "#EEF1F6",
  slateInk: "#3B4257",

  /** `--froly`, reservado para alertas. */
  alert: "#F97C95",
  alertPale: "#FFE4E9",
  alertInk: "#9E1F35",

  /** El rosa que sí pasa contraste: botones y enlaces. */
  berry: "#D6246F",
  berryDark: "#9E1550",

  ink: "#2E1F33",
  inkSoft: "#5C4A61",
  inkMuted: "#8A7A90",

  page: "#FFF7FB",
  card: "#FFFFFF",
  line: "#F2DDE8",
  lineSoft: "#EEF1F6",
  dotted: "#E2CFDB",
} as const;

export type Tint =
  | "pink"
  | "mint"
  | "blue"
  | "yellow"
  | "lavender"
  | "peach"
  | "slate"
  | "alert";

/** Cada tinte en sus tres papeles: relleno fuerte, relleno suave, texto. */
export const tints: Record<Tint, { base: string; pale: string; ink: string }> = {
  pink: { base: palette.pinkSoft, pale: palette.pinkPale, ink: palette.pinkInk },
  mint: { base: palette.mint, pale: palette.mintPale, ink: palette.mintInk },
  blue: { base: palette.blue, pale: palette.bluePale, ink: palette.blueInk },
  yellow: { base: palette.yellow, pale: palette.yellowPale, ink: palette.yellowInk },
  lavender: { base: palette.lavender, pale: palette.lavenderPale, ink: palette.lavenderInk },
  peach: { base: palette.peach, pale: palette.peachPale, ink: palette.peachInk },
  slate: { base: palette.slate, pale: palette.slatePale, ink: palette.slateInk },
  alert: { base: palette.alert, pale: palette.alertPale, ink: palette.alertInk },
};

/**
 * Fredoka y Quicksand son las mismas de `tailwind.config.ts`. Apple Mail, Mail
 * de iOS, Outlook para Mac y Thunderbird las descargan con el `@font-face` de
 * más abajo; Gmail (web y apps), Outlook de Windows y Yahoo borran las
 * tipografías web y caen en Trebuchet MS, la cara redonda que está instalada
 * en todas partes.
 *
 * Esa caída está elegida a propósito, y cubre la mayoría de los envíos: una
 * serif caería en Times y no se parecería en nada a la tienda. Si el
 * `@font-face` no llega, no se rompe nada: se ve como se veía antes.
 */
export const fonts = {
  display: "'Fredoka', 'Trebuchet MS', 'Segoe UI', Arial, sans-serif",
  body: "'Quicksand', 'Trebuchet MS', 'Segoe UI', Arial, sans-serif",
} as const;

/**
 * De dónde bajan las tipografías: `pdepapel-store/public/fonts`, el mismo
 * sitio del que sale el logo del correo. La tienda las sirve con
 * `access-control-allow-origin: *`; sin esa cabecera un cliente de correo no
 * puede cargar una fuente de otro dominio y no se vería ninguna.
 *
 * Si se mueven, hay que cambiar esto **y** su gemelo en
 * `pdepapel-store/emails/theme.ts`.
 */
export const FONT_BASE_URL = "https://papeleriapdepapel.com/fonts";

/** Los pesos que de verdad usan los tokens de abajo, y nada más. */
const FONT_FACES = [
  { family: "Fredoka", weight: 600, file: "fredoka-600.woff2" },
  { family: "Quicksand", weight: 400, file: "quicksand-400.woff2" },
  { family: "Quicksand", weight: 600, file: "quicksand-600.woff2" },
  { family: "Quicksand", weight: 700, file: "quicksand-700.woff2" },
] as const;

/**
 * El bloque `@font-face`. Es lo único del diseño que no puede ir en línea: no
 * existe un atributo `style` donde declarar una tipografía, así que va en un
 * `<style>` dentro del `<head>`, que es el único sitio donde un cliente de
 * correo lo lee.
 *
 * Son instancias **estáticas** por peso, no un archivo variable. Un variable
 * declarado con tres pesos distintos se apoya en que el motor sepa instanciar
 * el eje; un cliente que no lo haga pintaría la negrita igual que la redonda.
 *
 * `font-display: swap` para que el texto se lea de una con la tipografía de
 * respaldo en vez de quedarse en blanco esperando la descarga, y
 * `mso-font-alt` para decirle a Outlook a qué caer.
 */
export const fontFaceCss = FONT_FACES.map(
  ({ family, weight, file }) =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;mso-font-alt:'Trebuchet MS';src:url(${FONT_BASE_URL}/${file}) format('woff2');}`,
).join("");

export const LOGO_URL =
  "https://papeleriapdepapel.com/images/text-below-transparent-bg.png";

/* ------------------------------------------------------------------ lienzo */

export const main = {
  backgroundColor: palette.page,
  color: palette.ink,
  fontFamily: fonts.body,
  margin: "0",
  padding: "26px 12px",
} as const;

export const container = {
  backgroundColor: palette.card,
  border: `1px solid ${palette.line}`,
  borderRadius: "22px",
  margin: "0 auto",
  maxWidth: "560px",
  overflow: "hidden",
  padding: "0",
} as const;

/* -------------------------------------------------------------- piel tienda */

/**
 * La franja de papel con la mascota.
 *
 * Los correos de pedido la llevan siempre rosa aunque el estado sea otro: el
 * color de marca no se negocia por un estado, para eso está la pastilla. Los
 * del boletín sí cambian de tinte, que ahí la variedad es el punto.
 */
export function band(tint: Tint = "pink") {
  return {
    backgroundColor: tints[tint].pale,
    borderBottom: `3px solid ${tints[tint].base}`,
    padding: "20px 20px 16px",
    textAlign: "center" as const,
  };
}

export const mascot = {
  display: "block",
  height: "auto",
  margin: "0 auto",
  objectFit: "contain" as const,
} as const;

export function tagline(tint: Tint = "pink") {
  return {
    color: tints[tint].ink,
    fontFamily: fonts.body,
    fontSize: "11.5px",
    fontWeight: 700,
    letterSpacing: "0.17em",
    margin: "6px 0 0",
    textAlign: "center" as const,
    textTransform: "uppercase" as const,
  };
}

export const body = { padding: "22px 24px 26px" } as const;

/* --------------------------------------------------------------- piel panel */

/** La regla de color: lo que reemplaza a la franja en lo interno. */
export function rule(tint: Tint = "slate") {
  return {
    backgroundColor: tints[tint].base,
    fontSize: "0",
    height: "7px",
    lineHeight: "7px",
  } as const;
}

export const panelLabel = {
  color: "#6B7185",
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.15em",
  margin: "0",
  padding: "15px 24px 0",
  textTransform: "uppercase" as const,
} as const;

export function panelDot(tint: Tint = "slate") {
  return {
    backgroundColor: tints[tint].base,
    borderRadius: "3px",
    display: "inline-block",
    height: "8px",
    marginRight: "8px",
    width: "8px",
  } as const;
}

export const bodyPanel = { padding: "12px 24px 22px", fontSize: "14.5px" } as const;

/* ------------------------------------------------------------- tipografía */

export const h1 = {
  color: palette.ink,
  fontFamily: fonts.display,
  fontSize: "25px",
  fontWeight: 600,
  letterSpacing: "-0.005em",
  lineHeight: "1.22",
  margin: "12px 0 10px",
} as const;

export const h1Panel = { ...h1, fontSize: "20px", margin: "8px 0 8px" } as const;

export const paragraph = {
  color: palette.inkSoft,
  fontFamily: fonts.body,
  fontSize: "15px",
  lineHeight: "1.62",
  margin: "0 0 13px",
} as const;

/** La línea de contexto bajo el título en la piel panel (fecha, número). */
export const meta = {
  ...paragraph,
  color: palette.inkMuted,
  fontSize: "13px",
  margin: "0 0 14px",
} as const;

/* -------------------------------------------------------------- pastilla */

/**
 * El estado, como una calcomanía.
 *
 * Reemplaza la banda de color saturado a todo el ancho: esa chocaba con la
 * franja rosa que tiene encima y dejaba dos campos de color peleando.
 */
export function pill(tint: Tint) {
  return {
    backgroundColor: tints[tint].pale,
    border: `2px solid ${tints[tint].base}`,
    borderBottomWidth: "4px",
    borderRadius: "999px",
    color: tints[tint].ink,
    display: "inline-block",
    fontFamily: fonts.display,
    fontSize: "13.5px",
    fontWeight: 600,
    margin: "0",
    padding: "7px 17px",
  } as const;
}

/* ------------------------------------------------------- rótulo de sección */

/** El cuadradito de color que reemplaza a los emoji (🛍️ 💳 🚚 ✨). */
export function labelDot(tint: Tint) {
  return {
    backgroundColor: tints[tint].base,
    borderRadius: "3px",
    display: "inline-block",
    height: "9px",
    marginRight: "8px",
    width: "9px",
  } as const;
}

export const sectionLabel = {
  color: palette.inkSoft,
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.14em",
  margin: "20px 0 9px",
  textTransform: "uppercase" as const,
} as const;

/* --------------------------------------------------------------- tarjeta */

/**
 * La tarjeta calcomanía: el `0 4px 0` de la tienda hecho con bordes, porque
 * Gmail borra `box-shadow` y no puede borrar un borde.
 */
export function card(tint: Tint, filled = false) {
  return {
    backgroundColor: filled ? tints[tint].pale : palette.card,
    border: `2px solid ${tints[tint].base}`,
    borderBottomWidth: "4px",
    borderRadius: "16px",
    margin: "0 0 15px",
    padding: "14px 16px",
  } as const;
}

export const cardText = {
  color: palette.inkSoft,
  fontFamily: fonts.body,
  fontSize: "14.5px",
  lineHeight: "1.6",
  margin: "0",
} as const;

/* ----------------------------------------------------- filas de productos */

export const itemsTable = { borderCollapse: "collapse" as const, width: "100%" };

export const itemCell = {
  borderBottom: `1px dotted ${palette.dotted}`,
  fontFamily: fonts.body,
  fontSize: "14.5px",
  overflowWrap: "anywhere" as const,
  padding: "9px 0",
  verticalAlign: "top" as const,
  wordBreak: "break-word" as const,
} as const;

export const itemName = { color: palette.ink, fontWeight: 600 } as const;
export const itemQty = { color: palette.inkMuted, fontWeight: 600, whiteSpace: "nowrap" as const };
export const itemPrice = {
  ...itemCell,
  color: palette.ink,
  fontWeight: 700,
  paddingLeft: "12px",
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
} as const;

export const totalCell = {
  color: palette.ink,
  fontFamily: fonts.display,
  fontSize: "17px",
  fontWeight: 600,
  padding: "12px 0 0",
} as const;

/* ---------------------------------------------------------------- botones */

export const buttonSection = { margin: "20px 0 6px", textAlign: "center" as const } as const;

export const button = {
  backgroundColor: palette.berry,
  borderBottom: `4px solid ${palette.berryDark}`,
  borderRadius: "999px",
  color: "#FFFFFF",
  display: "inline-block",
  fontFamily: fonts.display,
  fontSize: "15.5px",
  fontWeight: 600,
  padding: "13px 28px",
  textDecoration: "none",
} as const;

/** El botón de la piel panel: no grita, pero sigue siendo el mismo objeto. */
export const buttonGhost = {
  ...button,
  backgroundColor: palette.card,
  border: `2px solid ${palette.pinkSoft}`,
  borderBottomWidth: "4px",
  color: palette.berry,
} as const;

/* ------------------------------------------------------------- el cupón */

export const ticket = {
  backgroundColor: palette.yellowPale,
  border: "2px dashed #E8C766",
  borderRadius: "16px",
  margin: "0 0 15px",
  padding: "16px",
  textAlign: "center" as const,
} as const;

export const ticketLabel = {
  color: palette.yellowInk,
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.14em",
  margin: "0 0 6px",
  textTransform: "uppercase" as const,
} as const;

export const ticketCode = {
  color: palette.berry,
  fontFamily: fonts.display,
  fontSize: "29px",
  fontWeight: 600,
  letterSpacing: "0.1em",
  margin: "0",
} as const;

export const ticketHint = {
  color: palette.yellowInk,
  fontFamily: fonts.body,
  fontSize: "12.5px",
  margin: "6px 0 0",
} as const;

/* -------------------------------------------------------- clave / valor */

/**
 * Una URL larga no tiene dónde partirse y estira la tabla entera: la alerta de
 * revalidación se desbordaba 85px en un teléfono. `overflowWrap` la parte.
 */
export const kvCell = {
  borderBottom: `1px solid ${palette.lineSoft}`,
  fontFamily: fonts.body,
  fontSize: "14px",
  overflowWrap: "anywhere" as const,
  padding: "6px 0",
  verticalAlign: "top" as const,
  wordBreak: "break-word" as const,
} as const;

export const kvKey = { ...kvCell, color: "#6B7185", fontWeight: 600, width: "44%" } as const;
export const kvValue = { ...kvCell, color: palette.ink, fontWeight: 600 } as const;

/* ------------------------------------------------------------- métricas */

export const metricCell = {
  backgroundColor: palette.slatePale,
  borderRadius: "12px",
  padding: "11px 8px",
  textAlign: "center" as const,
  width: "33.33%",
} as const;

export const metricValue = {
  color: palette.ink,
  fontFamily: fonts.display,
  fontSize: "25px",
  fontWeight: 600,
  lineHeight: "1.1",
  margin: "0",
} as const;

export const metricLabel = {
  color: "#6B7185",
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  lineHeight: "1.3",
  margin: "3px 0 0",
} as const;

/* ------------------------------------------------ productos del boletín */

export function productCell(tint: Tint = "pink") {
  return {
    backgroundColor: palette.card,
    border: `2px solid ${tints[tint].base}`,
    borderBottomWidth: "4px",
    borderRadius: "14px",
    padding: "9px",
    textAlign: "center" as const,
    verticalAlign: "top" as const,
    width: "33.33%",
  } as const;
}

export const productImage = {
  borderRadius: "9px",
  display: "block",
  height: "auto",
  margin: "0 auto 7px",
  maxWidth: "100%",
  objectFit: "cover" as const,
} as const;

export const productName = {
  color: palette.ink,
  fontFamily: fonts.body,
  fontSize: "12.5px",
  fontWeight: 600,
  lineHeight: "1.35",
  margin: "0",
} as const;

export const productPrice = {
  color: palette.berry,
  fontFamily: fonts.body,
  fontSize: "12.5px",
  fontWeight: 700,
  margin: "4px 0 0",
} as const;

/** La portada de la revista: es el correo, no un adjunto. */
export const cover = {
  border: `2px solid ${palette.lavender}`,
  borderBottomWidth: "4px",
  borderRadius: "14px",
  display: "block",
  height: "auto",
  margin: "0 auto 6px",
  maxWidth: "100%",
} as const;

/* ----------------------------------------------------------------- pie */

export const divider = {
  borderColor: palette.line,
  borderWidth: "1px 0 0",
  margin: "22px 0 15px",
} as const;

export const footer = {
  color: palette.inkMuted,
  fontFamily: fonts.body,
  fontSize: "12px",
  lineHeight: "1.6",
  margin: "0",
  textAlign: "center" as const,
} as const;

export const link = { color: palette.berry, textDecoration: "underline" } as const;
export const footerLink = { color: palette.inkMuted, textDecoration: "underline" } as const;
