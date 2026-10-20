import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { ReactivationEmailTemplate, reactivationEmailText } from "@/emails/reactivation-email";

const props = {
  customerName: "Luisa Sánchez",
  discountCode: "VUELVE-AB12",
  discountPercentage: 10,
  recommendedProducts: [{ id: "p1", slug: "libreta-a5", name: "Libreta A5", imageUrl: "https://res.cloudinary.com/x.png", priceFormatted: "$ 15.000" }],
  storeUrl: "https://papeleriapdepapel.com",
  unsubscribeUrl: "https://admin.papeleriapdepapel.com/api/tienda/newsletter/unsubscribe?hash=abc",
};

describe("correo de reactivación", () => {
  it("lleva la plantilla de la tienda y su texto plano con el código, los productos y el enlace", async () => {
    const html = await render(ReactivationEmailTemplate(props));
    expect(html).toContain("VUELVE-AB12");
    expect(html).toContain("Te extrañamos");
    const text = reactivationEmailText(props);
    expect(text).toContain("Hace rato no te vemos, Luisa.");
    expect(text).toContain("Tu código: VUELVE-AB12 (10 % en toda la tienda).");
    expect(text).toContain("• Libreta A5 ($ 15.000): https://papeleriapdepapel.com/producto/libreta-a5");
    expect(text).toContain("Usar mi descuento: https://papeleriapdepapel.com");
    expect(text).toContain("Cancelar suscripción: https://admin.papeleriapdepapel.com/api/tienda/newsletter/unsubscribe?hash=abc");
    expect(html).toContain("cancelar la suscripción");
  });
});
