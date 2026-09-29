import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { GiftNotification } from "@/emails/gift-notification";

/** React deja `<!-- -->` entre texto e interpolaciones; se quitan para leer el texto seguido. */
const renderText = async (element: React.ReactElement) =>
  (await render(element)).replace(/<!--[\s\S]*?-->/g, "");

/**
 * El aviso a quien recibe un regalo es una sorpresa: nunca lleva productos,
 * precios, totales, número ni enlace del pedido. Estas pruebas fijan eso
 * además del texto por estado.
 */
const base = {
  recipientName: "Mariana López",
  buyerName: "Luisa Sánchez",
  message: "¡Feliz cumpleaños! Para que llenes estas hojas de ideas bonitas.",
};

const forbidden = [
  "$",
  "Ver mi pedido",
  "Tu pedido #",
  "papeleriapdepapel.com/pedido",
  "Total",
  "Cuaderno",
];

describe("gift notification email", () => {
  it("announces the gift on payment with the buyer's name and message, without prices or links", async () => {
    const html = await renderText(<GiftNotification {...base} status="PAID" />);

    expect(html).toContain("Un regalo en camino");
    expect(html).toContain("Mariana, alguien pensó en ti.");
    expect(html).toContain("Luisa Sánchez te envió un regalo de P de Papel");
    expect(html).toContain("Un mensaje de Luisa Sánchez");
    expect(html).toContain("Para que llenes estas hojas de ideas bonitas");
    expect(html).toContain("no muestra qué hay dentro ni cuánto costó");
    for (const text of forbidden) expect(html).not.toContain(text);
  });

  it("skips the message card when the buyer left none", async () => {
    const html = await renderText(
      <GiftNotification {...base} message={null} status="PAID" />,
    );

    expect(html).not.toContain("Un mensaje de");
  });

  it("carries the tracking guide on shipping updates", async () => {
    const html = await renderText(
      <GiftNotification {...base} status="Shipped" trackingInfo="GUIA123" />,
    );

    expect(html).toContain("Tu regalo salió de la papelería.");
    expect(html).toContain("GUIA123");
    expect(html).toContain("https://www.envioclick.com/co/track/GUIA123");
    for (const text of forbidden) expect(html).not.toContain(text);
  });

  it("explains a failed delivery and asks to reply", async () => {
    const html = await renderText(
      <GiftNotification {...base} status="FailedDelivery" />,
    );

    expect(html).toContain("No pudimos entregar tu regalo.");
    expect(html).toContain("responde este correo");
  });

  it("never renders the placeholder tracking code", async () => {
    const html = await renderText(
      <GiftNotification {...base} status="Delivered" trackingInfo="TRACK-123" />,
    );

    expect(html).toContain("Tu regalo ya está en tus manos.");
    expect(html).not.toContain("TRACK-123");
  });
});
