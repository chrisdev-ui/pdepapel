import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { NewsletterConfirmation } from "@/emails/newsletter-confirmation";
import { NewsletterWelcome } from "@/emails/newsletter-welcome";

describe("newsletter emails", () => {
  it("explains the double opt-in limit and preserves the confirmation link", async () => {
    const confirmationUrl =
      "https://papeleriapdepapel.com/suscripcion/confirmar?token=confirmation-token";
    const html = await render(
      <NewsletterConfirmation confirmationUrl={confirmationUrl} />,
    );

    expect(html).toContain("Confirmar suscripción");
    expect(html).toContain("máximo dos correos al mes");
    expect(html).toContain("vence en 48 horas");
    expect(html).toContain(confirmationUrl.replaceAll("&", "&amp;"));
  });

  it("includes a visible no-login unsubscribe link in the welcome email", async () => {
    const unsubscribeUrl =
      "https://papeleriapdepapel.com/suscripcion/cancelar?token=unsubscribe-token";
    const html = await render(
      <NewsletterWelcome
        shopUrl="https://papeleriapdepapel.com/tienda"
        unsubscribeUrl={unsubscribeUrl}
      />,
    );

    expect(html).toContain("cancelar la suscripción");
    expect(html).toContain("sin iniciar sesión");
    expect(html).toContain(unsubscribeUrl.replaceAll("&", "&amp;"));
    expect(html).toContain("Medellín, Colombia");
  });
});
