import { OrderStatus, OrderType } from "@prisma/client";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "production", FRONTEND_STORE_URL: "https://tienda.example" } }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { NewsletterConfirmation } from "@/emails/newsletter-confirmation";
import { PanelNotice } from "@/emails/panel-notice";
import { ReactivationEmailTemplate, reactivationEmailText } from "@/emails/reactivation-email";
import { buildOrderEmails } from "@/lib/email";
import { socialLinksText, STORE_SOCIAL_LINKS } from "@/lib/social-links";

/**
 * Todo correo a clientes (piel «tienda») lleva las cuatro redes al pie, en el
 * HTML como enlaces de texto y en la parte `text`; los avisos del panel no.
 */
const order = {
  id: "order-1",
  storeId: "store-1",
  orderNumber: "ORD-1",
  fullName: "Luisa Sánchez",
  email: "luisa@example.com",
  phone: "+573001234567",
  address: "",
  city: null,
  total: 100000,
  subtotal: 100000,
  discount: 0,
  couponDiscount: 0,
  giftCardAmount: 0,
  type: OrderType.STANDARD,
  orderItems: [],
  payment: null,
  shipping: null,
  coupon: null,
  isGift: false,
  giftRecipientName: null,
  giftRecipientEmail: null,
  riskScore: 0,
  riskReasons: null,
  giftCardReview: null,
} as never;

const expectSocialHtml = (html: string) => {
  expect(html).toContain("Síguenos:");
  for (const link of STORE_SOCIAL_LINKS) expect(html).toContain(`href="${link.url}"`);
  expect(html).not.toContain("<svg");
};

describe("pie de redes en los correos", () => {
  it("el texto plano nombra las cuatro redes con su dirección", () => {
    expect(socialLinksText()).toBe(
      "Síguenos: Instagram https://instagram.com/papeleria.pdepapel · TikTok https://tiktok.com/@papeleria.pdepapel · Facebook https://www.facebook.com/papeleriapdepapel/ · YouTube https://www.youtube.com/@papeleriapdepapel",
    );
  });

  it("el correo de pedido a la clienta lo lleva en HTML y texto; el aviso del panel no", async () => {
    const { admin, customer } = buildOrderEmails(order, OrderStatus.PAID);
    expect(customer).not.toBeNull();
    expectSocialHtml(await render(customer!.react as never));
    expect(customer!.text).toContain(socialLinksText());
    const adminHtml = await render(admin.react as never);
    expect(adminHtml).not.toContain("Síguenos:");
    expect(admin.text).not.toContain("Síguenos:");
  });

  it("los correos de boletín y de reactivación lo llevan; un aviso del panel no", async () => {
    expectSocialHtml(await render(NewsletterConfirmation({ confirmationUrl: "https://tienda.example/c" }) as never));
    const props = { customerName: "Luisa", discountCode: "VUELVE-1", discountPercentage: 10, recommendedProducts: [], storeUrl: "https://tienda.example", unsubscribeUrl: "https://admin.example/u" };
    expectSocialHtml(await render(ReactivationEmailTemplate(props)));
    expect(reactivationEmailText(props)).toContain(socialLinksText());
    const notice = await render(PanelNotice({ preview: "p", label: "Panel", title: "Aviso", summary: "Resumen" } as never) as never);
    expect(notice).not.toContain("Síguenos:");
  });
});
