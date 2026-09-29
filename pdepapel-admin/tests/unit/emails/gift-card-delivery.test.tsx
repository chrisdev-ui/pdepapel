import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { GiftCardDelivery } from "@/emails/gift-card-delivery";

const renderText = async (element: React.ReactElement) =>
  (await render(element)).replace(/<!--[\s\S]*?-->/g, "");

const base = {
  recipientName: "Mariana López",
  buyerName: "Luisa Sánchez",
  amount: "$ 100.000",
  code: "PDP-7K3M-P9QX-2R8T",
};

describe("gift card delivery email", () => {
  it("hands the recipient the code, the amount and the buyer's message", async () => {
    const html = await renderText(
      <GiftCardDelivery {...base} message="¡Feliz cumpleaños!" />,
    );
    expect(html).toContain("Mariana, Luisa Sánchez te regaló $ 100.000.");
    expect(html).toContain("PDP-7K3M-P9QX-2R8T");
    expect(html).toContain("Un mensaje de Luisa Sánchez");
    expect(html).toContain("¡Feliz cumpleaños!");
    expect(html).toContain("el código no se muestra en ningún otro sitio");
  });

  it("speaks to the buyer when she kept the card for herself to hand over", async () => {
    const html = await renderText(<GiftCardDelivery {...base} toBuyer />);
    expect(html).toContain("Tu tarjeta de regalo está lista.");
    expect(html).toContain("Compártela como quieras");
    expect(html).toContain("PDP-7K3M-P9QX-2R8T");
  });

  it("explains a reissue: the old code stopped working", async () => {
    const html = await renderText(<GiftCardDelivery {...base} reissued />);
    expect(html).toContain("Código reemitido");
    expect(html).toContain("Aquí está tu código nuevo.");
    expect(html).toContain("El código anterior dejó de servir");
  });
});
