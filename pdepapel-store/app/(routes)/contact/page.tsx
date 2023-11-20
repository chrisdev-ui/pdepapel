import { Icons } from "@/components/icons";
import { Container } from "@/components/ui/container";
import { Separator } from "@/components/ui/separator";
import { Clock, Mail, MailCheck, PhoneCall } from "lucide-react";
import { ContactForm } from "./components/contact-form";

export default function ContactPage() {
  return (
    <>
      <Container>
        <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
          ¡Estamos aquí para escucharte!
          <MailCheck className="ml-2 h-8 w-8" />
        </h1>
        <Separator className="my-10" />
        <div className="grid w-full grid-cols-1 gap-20 md:grid-cols-2">
          <div className="flex flex-col gap-y-6">
            <div className="flex w-full items-center justify-start py-2">
              <h2 className="font-serif text-xl font-semibold">
                Háblanos de tus Ideas Kawaii
              </h2>
              <span className="ml-5 flex-1 border-t" />
            </div>
            <ContactForm />
          </div>
          <div>
            <div className="flex w-full p-8" />
            <div className="flex w-full flex-col gap-y-5">
              <p>
                En <span className="text-pink-froly">P de Papel</span>, nos
                encanta estar en contacto contigo. Si tienes alguna duda o
                simplemente quieres decir hola, no dudes en enviarnos un correo
                electrónico. Nos esforzamos por responder a todos los mensajes
                en un plazo de 12 a 24 horas, porque sabemos lo importante que
                es para ti recibir una respuesta rápida y amigable.
              </p>
              <p>
                Además, nos aseguramos de mantenerte informado sobre el estado
                de tu pedido a través de correo electrónico. Si no encuentras
                nuestras actualizaciones, te sugerimos echar un vistazo a tu
                carpeta de spam. O aún mejor, puedes visitar tu perfil aquí en
                nuestro sitio web, donde encontrarás un enlace directo a tus
                órdenes con todos los detalles que necesitas. ¡Estamos aquí para
                ayudarte en cada paso de tu experiencia kawaii en{" "}
                <span className="text-pink-froly">P de Papel</span>!
              </p>
              <div className="flex w-full items-center justify-start py-2">
                <h2 className="font-serif text-xl font-semibold">
                  Contáctanos
                </h2>
                <span className="ml-5 flex-1 border-t" />
              </div>
              <div className="flex w-full flex-col gap-5">
                <div className="flex flex-1 items-center justify-start gap-x-5">
                  <Icons.whatsapp className="h-10 w-10 text-green-500" />
                  <span className="font-serif font-medium text-green-500">
                    Whatsapp:
                  </span>
                  <span>(+57) 321 629 9845</span>
                </div>
                <div className="flex flex-1 items-center justify-start gap-x-5">
                  <PhoneCall className="h-10 w-10" />
                  <span className="font-serif font-medium">Teléfono:</span>
                  <span>(+57) 321 629 9845</span>
                  <span className="text-xs">
                    Aceptamos ordenes por medio telefónico
                  </span>
                </div>
                <div className="flex flex-1 items-center justify-start gap-x-5">
                  <Mail className="h-10 w-10 text-pink-froly" />
                  <span className="font-serif font-medium text-pink-froly">
                    Correo electrónico:
                  </span>
                  <span>papeleria.pdepapel@gmail.com</span>
                </div>
                <div className="flex flex-1 items-center justify-start gap-x-5">
                  <Clock className="h-10 w-10 text-green-leaf" />
                  <span className="font-serif font-medium text-green-leaf">
                    Horario de atención:
                  </span>
                  <span className="flex items-center gap-2">
                    Todos los días (08:00AM - 08:00PM){" "}
                    <Icons.flags.colombia className="h-4 w-4" />{" "}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
