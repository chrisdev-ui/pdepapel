import { EmailTemplate } from "@/components/email-template";
import { resend } from "@/lib/resend";

export async function sendOrderEmail(
  fullName: string,
  order: {
    fullName: string;
    phone: string;
    address: string;
    orderNumber: string;
  },
) {
  await resend.emails.send({
    from: "Orders <admin@papeleriapdepapel.com>",
    to: ["web.christian.dev@gmail.com", "papeleria.pdepapel@gmail.com"],
    subject: `Nueva orden de compra - ${fullName}`,
    react: EmailTemplate({
      name: order.fullName,
      phone: order.phone,
      address: order.address,
      orderNumber: order.orderNumber,
      paymentMethod: "Transferencia bancaria o contra entrega",
    }) as React.ReactElement,
  });
}
