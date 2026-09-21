/**
 * La cara de P de Papel en el correo — copia de trabajo para la tienda.
 *
 * El gemelo completo vive en `pdepapel-admin/emails/theme.ts`, que es donde
 * salen las trece plantillas restantes. Aquí solo está lo que necesita el
 * único correo que manda la tienda (el formulario de contacto), que va en la
 * piel **panel**: lo recibe Paula, no un cliente, así que no lleva mascota.
 *
 * Los dos apps no comparten paquete —cada uno tiene sus dependencias y su
 * `package.json`— por eso esto se duplica en vez de importarse. Si cambian los
 * tonos, hay que cambiarlos en los dos lados.
 *
 * Reglas del medio: todo en línea (Gmail borra `<style>`), nada de flex ni
 * grid, y la sombra dura de la tienda se hace con `borderBottomWidth`, porque
 * Gmail sí borra `box-shadow`.
 */

export const palette = {
  lavender: "#D6ADEB",
  lavenderPale: "#F1E3F8",

  slate: "#C3CAD9",
  slatePale: "#EEF1F6",

  /** El rosa que sí pasa contraste (4,9:1 sobre blanco). */
  berry: "#D6246F",
  berryDark: "#9E1550",
  pinkSoft: "#F9B8D9",

  ink: "#2E1F33",
  inkSoft: "#5C4A61",
  inkMuted: "#8A7A90",

  page: "#FFF7FB",
  card: "#FFFFFF",
  line: "#F2DDE8",
  lineSoft: "#EEF1F6",
} as const;

export const fonts = {
  display: "'Fredoka', 'Trebuchet MS', 'Segoe UI', Arial, sans-serif",
  body: "'Quicksand', 'Trebuchet MS', 'Segoe UI', Arial, sans-serif",
} as const;

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

/** La regla de color: lo que reemplaza a la franja en la piel panel. */
export const rule = {
  backgroundColor: palette.lavender,
  fontSize: "0",
  height: "7px",
  lineHeight: "7px",
} as const;

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

export const panelDot = {
  backgroundColor: palette.lavender,
  borderRadius: "3px",
  display: "inline-block",
  height: "8px",
  marginRight: "8px",
  width: "8px",
} as const;

export const body = { padding: "12px 24px 22px" } as const;

export const heading = {
  color: palette.ink,
  fontFamily: fonts.display,
  fontSize: "20px",
  fontWeight: 600,
  lineHeight: "1.22",
  margin: "8px 0 8px",
} as const;

export const paragraph = {
  color: palette.inkSoft,
  fontFamily: fonts.body,
  fontSize: "14.5px",
  lineHeight: "1.6",
  margin: "0 0 13px",
} as const;

export const sectionLabel = {
  color: palette.inkSoft,
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.14em",
  margin: "20px 0 9px",
  textTransform: "uppercase" as const,
} as const;

export const labelDot = {
  backgroundColor: palette.lavender,
  borderRadius: "3px",
  display: "inline-block",
  height: "9px",
  marginRight: "8px",
  width: "9px",
} as const;

/** La tarjeta calcomanía: el `0 4px 0` de la tienda, hecho con bordes. */
export function card(tone: "slate" | "lavender", filled = false) {
  const base = tone === "slate" ? palette.slate : palette.lavender;
  const pale = tone === "slate" ? palette.slatePale : palette.lavenderPale;
  return {
    backgroundColor: filled ? pale : palette.card,
    border: `2px solid ${base}`,
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
  whiteSpace: "pre-wrap" as const,
} as const;

export const table = { borderCollapse: "collapse" as const, width: "100%" };

/** `overflowWrap` para que un correo largo no estire la tabla en el teléfono. */
const cell = {
  borderBottom: `1px solid ${palette.lineSoft}`,
  fontFamily: fonts.body,
  fontSize: "14px",
  overflowWrap: "anywhere" as const,
  padding: "6px 0",
  verticalAlign: "top" as const,
  wordBreak: "break-word" as const,
} as const;

export const kvKey = { ...cell, color: "#6B7185", fontWeight: 600, width: "44%" } as const;
export const kvValue = { ...cell, color: palette.ink, fontWeight: 600 } as const;

export const buttonSection = { margin: "20px 0 6px", textAlign: "center" as const } as const;

/** El botón de la piel panel: no grita, pero es el mismo objeto. */
export const buttonGhost = {
  backgroundColor: palette.card,
  border: `2px solid ${palette.pinkSoft}`,
  borderBottomWidth: "4px",
  borderRadius: "999px",
  color: palette.berry,
  display: "inline-block",
  fontFamily: fonts.display,
  fontSize: "15.5px",
  fontWeight: 600,
  padding: "13px 28px",
  textDecoration: "none",
} as const;

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
