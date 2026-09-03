import {
  ChevronRight,
  Clock,
  Mail,
  MailCheck,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Truck,
} from "lucide-react";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ContactPage as ContactPageSchema, WithContext } from "schema-dts";

import { Icons } from "@/components/icons";
import { BASE_URL } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { ContactForm } from "./components/contact-form";

export const metadata: Metadata = {
  title: "Contáctanos",
  description:
    "Contacta a Papelería P de Papel, tienda online colombiana con operación desde Medellín y envíos a todo el país. Resolvemos dudas sobre productos kawaii, pedidos y entregas.",
  alternates: {
    canonical: STOREFRONT_ROUTES.contact,
  },
  openGraph: {
    url: `${BASE_URL}${STOREFRONT_ROUTES.contact}`,
  },
  keywords: [
    "contacto",
    "atención al cliente",
    "papelería",
    "soporte",
    "ubicación",
    "teléfono",
    "email",
  ],
};

export const revalidate = 60;

const PHONE_DISPLAY = "(+57) 313 258 2293";
const WHATSAPP_URL =
  "https://api.whatsapp.com/send/?phone=%2B573132582293&text&type=phone_number&app_absent=0";
const PHONE_URL = "tel:+573132582293";
const EMAIL = "papeleria.pdepapel@gmail.com";

interface ContactChannel {
  id: string;
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
  href?: string;
  external?: boolean;
  icon: React.ReactNode;
  tileClassName: string;
  labelClassName: string;
  tag?: string;
}

const contactChannels: ContactChannel[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    value: PHONE_DISPLAY,
    hint: "Escríbenos por chat",
    href: WHATSAPP_URL,
    external: true,
    icon: <Icons.whatsapp className="h-6 w-6" aria-hidden="true" />,
    tileClassName: "bg-green-50 text-green-600",
    labelClassName: "text-green-600",
    tag: "Más rápido",
  },
  {
    id: "telefono",
    label: "Teléfono",
    value: PHONE_DISPLAY,
    hint: "También tomamos pedidos por llamada",
    href: PHONE_URL,
    icon: <Phone className="h-6 w-6" aria-hidden="true" />,
    tileClassName: "bg-kawaii-blue-light text-sky-700",
    labelClassName: "text-sky-700",
  },
  {
    id: "correo",
    label: "Correo electrónico",
    value: <span className="break-all">{EMAIL}</span>,
    hint: "Respuesta en 12 a 24 horas",
    href: `mailto:${EMAIL}`,
    icon: <Mail className="h-6 w-6" aria-hidden="true" />,
    tileClassName: "bg-pink-shell/30 text-pink-froly",
    labelClassName: "text-pink-froly",
  },
  {
    id: "horario",
    label: "Horario de atención",
    value: (
      <>
        Todos los días
        <br />
        8:00 a. m. a 8:00 p. m.
      </>
    ),
    hint: (
      <>
        <Icons.flags.colombia className="h-4 w-4" aria-hidden="true" />
        Hora de Colombia
      </>
    ),
    icon: <Clock className="h-6 w-6" aria-hidden="true" />,
    tileClassName: "bg-kawaii-lavender-light text-violet-700",
    labelClassName: "text-violet-700",
  },
];

interface HelpLink {
  id: string;
  title: string;
  description: string;
  href: string;
  external?: boolean;
  icon: React.ReactNode;
  tileClassName: string;
}

const helpLinks: HelpLink[] = [
  {
    id: "pedido",
    title: "¿Dónde va mi pedido?",
    description:
      "Míralo en Mis pedidos o en el correo de confirmación (revisa también spam).",
    href: STOREFRONT_ROUTES.myOrders,
    icon: <Package className="h-[18px] w-[18px]" aria-hidden="true" />,
    tileClassName: "bg-kawaii-pink-light",
  },
  {
    id: "envios",
    title: "¿Envían a mi ciudad?",
    description: "Sí, a toda Colombia. Consulta las políticas de entrega.",
    href: STOREFRONT_ROUTES.shippingPolicy,
    icon: <Truck className="h-[18px] w-[18px]" aria-hidden="true" />,
    tileClassName: "bg-kawaii-blue-light",
  },
  {
    id: "whatsapp",
    title: "¿Puedo pedir por WhatsApp?",
    description: "Claro, también tomamos pedidos por chat y por llamada.",
    href: WHATSAPP_URL,
    external: true,
    icon: <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />,
    tileClassName: "bg-kawaii-mint-light",
  },
];

function ContactChannelCard({ channel }: { channel: ContactChannel }) {
  const content = (
    <>
      {channel.tag && (
        <span className="absolute right-3.5 top-3.5 rounded-full bg-kawaii-yellow-light px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-yankees">
          {channel.tag}
        </span>
      )}
      <span
        className={cn(
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          channel.tileClassName,
        )}
      >
        {channel.icon}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span
          className={cn("font-serif text-sm font-bold", channel.labelClassName)}
        >
          {channel.label}
        </span>
        <span className="font-semibold leading-snug">{channel.value}</span>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          {channel.hint}
        </span>
      </span>
    </>
  );

  const className =
    "relative flex items-center gap-3.5 rounded-2xl border border-pink-shell/30 bg-white p-4 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)] transition sm:flex-col sm:items-stretch sm:p-5";

  if (!channel.href) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link
      href={channel.href}
      target={channel.external ? "_blank" : undefined}
      rel={channel.external ? "noopener noreferrer" : undefined}
      className={cn(
        className,
        "hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2",
      )}
    >
      {content}
    </Link>
  );
}

export default function ContactPage() {
  const jsonLd: WithContext<ContactPageSchema> = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contáctanos | Papelería P de Papel",
    description: "Ponte en contacto con nosotros para cualquier duda o pedido.",
    mainEntity: {
      "@type": "Organization",
      name: "Papelería P de Papel",
      url: BASE_URL,
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+57-313-258-2293",
        contactType: "customer service",
        areaServed: "CO",
        availableLanguage: "es",
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: "Medellín",
        addressRegion: "Antioquia",
        addressCountry: "CO",
      },
    },
  };

  return (
    <>
      <section className="sparkle bg-kawaii-pink-light/15 relative overflow-hidden px-4 pb-20 pt-10 text-center sm:px-6 sm:pb-24 sm:pt-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-kawaii-lavender-light blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-kawaii-blue-light blur-3xl"
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-kawaii-mint-light px-3.5 py-1.5 text-sm font-medium">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-green-500"
            />
            Respondemos en 12 a 24 horas
          </span>
          <h1 className="text-balance flex flex-wrap items-center justify-center gap-2.5 font-serif text-3xl font-bold sm:text-4xl">
            ¡Estamos aquí para escucharte!
            <MailCheck
              className="h-7 w-7 text-pink-froly sm:h-9 sm:w-9"
              aria-hidden="true"
            />
          </h1>
          <p className="text-pretty max-w-xl text-muted-foreground sm:text-lg">
            ¿Dudas sobre un producto, un pedido o un envío? Escríbenos por donde
            prefieras. Atendemos todos los días desde Medellín.
          </p>
        </div>
      </section>

      <div className="relative mx-auto -mt-12 max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {contactChannels.map((channel) => (
            <li key={channel.id} className="min-w-0">
              <ContactChannelCard channel={channel} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto grid max-w-screen-2xl items-start gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10 lg:px-8 lg:pb-20">
        <section
          aria-labelledby="formulario-contacto"
          className="flex flex-col gap-6 rounded-3xl border border-pink-shell/30 bg-white p-5 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)] sm:p-8"
        >
          <div className="flex flex-col gap-1.5">
            <h2
              id="formulario-contacto"
              className="font-serif text-2xl font-bold"
            >
              Háblanos de tus ideas kawaii
            </h2>
            <p className="text-muted-foreground">
              Cuéntanos qué necesitas y te respondemos por correo.
            </p>
          </div>
          <ContactForm />
        </section>

        <div className="flex flex-col gap-5">
          <section
            aria-labelledby="ubicacion-cobertura"
            className="rounded-2xl border border-pink-shell/30 bg-kawaii-pink-light/10 p-5"
          >
            <h2
              id="ubicacion-cobertura"
              className="font-serif text-xl font-semibold"
            >
              Ubicación y cobertura
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <MapPin
                  className="mt-0.5 h-6 w-6 shrink-0 text-pink-froly"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-semibold">Operamos desde Medellín</p>
                  <p className="text-sm text-muted-foreground">
                    Atención y preparación de pedidos desde Medellín, Antioquia.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Truck
                  className="mt-0.5 h-6 w-6 shrink-0 text-blue-purple"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-semibold">Enviamos a toda Colombia</p>
                  <p className="text-sm text-muted-foreground">
                    A ciudades y municipios con cobertura de las transportadoras
                    disponibles.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="antes-de-escribirnos"
            className="rounded-2xl border border-pink-shell/30 bg-white p-5 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]"
          >
            <h2
              id="antes-de-escribirnos"
              className="mb-2 font-serif text-xl font-semibold"
            >
              Antes de escribirnos
            </h2>
            <ul className="divide-y">
              {helpLinks.map((link) => (
                <li key={link.id}>
                  <Link
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="group flex min-h-[44px] items-center gap-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
                  >
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-blue-yankees",
                        link.tileClassName,
                      )}
                    >
                      {link.icon}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold text-blue-yankees">
                        {link.title}
                      </span>
                      <span className="text-[13px] text-muted-foreground">
                        {link.description}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex items-center gap-4 rounded-2xl bg-kawaii-lavender-light p-5">
            <Image
              src="/images/no-text-transparent-bg.webp"
              alt="Logo Papelería P de Papel"
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 object-contain"
              unoptimized
            />
            <p className="font-serif text-[15px] italic leading-relaxed">
              En P de Papel nos encanta estar en contacto contigo. Si solo
              quieres decir hola, también nos alegra el día.
            </p>
          </section>
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
