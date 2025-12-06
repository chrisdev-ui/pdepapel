import { EmailTemplate } from "@/components/email-template";
import { env } from "@/lib/env.mjs";
import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, subject, message, mobile } = body;

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
      react: EmailTemplate({
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
