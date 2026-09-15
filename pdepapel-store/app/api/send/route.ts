import { ContactFormEmail } from "@/emails/contact-form";
import { env } from "@/lib/env.mjs";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

const resend = new Resend(env.RESEND_API_KEY);

/** Lo mismo que valida el formulario, aplicado también aquí: la ruta es
 *  pública y el correo sale desde el dominio de la tienda. */
const contactSchema = z.object({
  name: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(120),
  subject: z.string().trim().max(150).optional(),
  message: z.string().trim().max(4000).optional(),
  mobile: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Revisa los datos del formulario" },
        { status: 400 },
      );
    }
    const { name, email, subject, message, mobile } = parsed.data;

    // Honeypot check: If mobile field is present, it's a bot
    if (mobile) {
      console.log("Spam attempt detected (honeypot caught):", {
        name,
        email,
        mobile,
      });
      // Return success to fool the bot
      return NextResponse.json({ success: true });
    }

    const { data, error } = await resend.emails.send({
      from: "Contact <admin@papeleriapdepapel.com>",
      to: ["web.christian.dev@gmail.com", "papeleria.pdepapel@gmail.com"],
      subject: `Nueva solicitud de contacto - ${name}`,
      react: ContactFormEmail({
        name,
        email,
        subject,
        message,
      }) as React.ReactElement,
    });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: `${error.message}` }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message}` },
      { status: error.statusCode },
    );
  }
}
