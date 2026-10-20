import { Fragment } from "react";

import { CardText, Cta, Foot, Meta, P, PanelShell, SectionLabel, StickerCard, Title } from "./components";
import type { Tint } from "./theme";

export interface PanelNoticeSection {
  label: string;
  lines: string[];
}

export interface PanelNoticeProps {
  preview: string;
  /** La regla de arriba: «Panel · Inventario». */
  label: string;
  /** `alert` para lo que hay que mirar hoy; `slate` para resúmenes. */
  tint?: Tint;
  title: string;
  meta?: string;
  /** Lo que pasó, en una o dos frases, dentro de la calcomanía. */
  summary: string;
  sections?: PanelNoticeSection[];
  /** Qué hacer. */
  action?: string;
  cta?: { href: string; label: string };
  /** «Este aviso sale como mucho una vez por hora». */
  note?: string;
}

/**
 * Los avisos automáticos del panel (MySQL, Mercado Libre, WhatsApp,
 * inventario, reservas, pagos): antes salían en texto plano; ahora todos con
 * la piel «panel», como el resto de los correos. El texto plano sigue en cada
 * envío para quien lee sin HTML.
 */
export function PanelNotice({ preview, label, tint = "alert", title, meta, summary, sections = [], action, cta, note }: PanelNoticeProps) {
  return (
    <PanelShell preview={preview} tint={tint} label={label}>
      <Title panel>{title}</Title>
      {meta ? <Meta>{meta}</Meta> : null}
      <StickerCard tint={tint} filled>
        <CardText>{summary}</CardText>
      </StickerCard>
      {sections
        .filter((section) => section.lines.length > 0)
        .map((section) => (
          <Fragment key={section.label}>
            <SectionLabel tint="slate">{section.label}</SectionLabel>
            <StickerCard tint="slate">
              {section.lines.map((line, index) => (
                <CardText key={`${section.label}-${index}`}>{line}</CardText>
              ))}
            </StickerCard>
          </Fragment>
        ))}
      {action ? <P>{action}</P> : null}
      {cta ? <Cta href={cta.href}>{cta.label}</Cta> : null}
      <Foot>{note ?? "Panel de P de Papel · aviso automático"}</Foot>
    </PanelShell>
  );
}

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
PanelNotice.PreviewProps = {
  preview: "Un pedido se pagó sin stock suficiente",
  label: "Panel · Inventario",
  title: "Pedido pagado sin stock",
  summary: "El pedido ORD-123 se pagó, pero no había unidades para todo lo que pidió.",
  sections: [{ label: "Lo que falta", lines: ["Libreta A5: faltan 1"] }],
  action: "Abre el pedido: repón o cambia el producto con la clienta, o devuélvele el dinero.",
  cta: { href: "https://admin.papeleriapdepapel.com", label: "Abrir el pedido" },
} satisfies PanelNoticeProps;

export default PanelNotice;
