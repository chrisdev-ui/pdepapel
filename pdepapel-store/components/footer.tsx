import { Icons } from "@/components/icons";
import { CalendarDays, Mail, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export const Footer: React.FC<{}> = () => {
  return (
    <footer className="divide-y px-4">
      <div className="container mx-auto flex flex-col justify-between space-y-8 py-10 lg:flex-row lg:space-y-0">
        <div className="lg:w-1/3">
          <Link
            href="#"
            rel="noopener noreferrer"
            className="flex justify-center space-x-3 lg:justify-start"
          >
            <div className="relative flex h-32 w-full items-center justify-center sm:w-64">
              <Image
                src="/images/text-beside-transparent-bg.webp"
                alt="Logo Papelería P de Papel con nombre al lado"
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-cover"
                priority
                fill
                quality="100"
              />
            </div>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-8 text-sm lg:w-2/3">
          <div className="space-y-3">
            <h3 className="uppercase tracking-wide">Contáctenos</h3>
            <ul className="space-y-1">
              <li className="">
                <Link
                  href="https://api.whatsapp.com/send/?phone=%2B573216299845&text&type=phone_number&app_absent=0"
                  className="flex items-center gap-2 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell"
                >
                  <Icons.whatsapp className="h-5 w-5" />
                  (+57) 321 629 9845
                </Link>
              </li>
              <li className="">
                <Link
                  href="tel:+573216299845"
                  className="flex items-center gap-2 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell"
                >
                  <Phone className="h-5 w-5" />
                  (+57) 321 629 9845
                </Link>
              </li>
              <li className="">
                <Link
                  href="mailto:papeleria.pdepapel@gmail.com"
                  className="flex items-center gap-2 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell"
                >
                  <Mail className="h-5 w-5" />
                  <span className="truncate">papeleria.pdepapel@gmail.com</span>
                </Link>
              </li>
              <li className="flex items-center gap-2 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell">
                <CalendarDays className="h-5 w-5" />
                08:00 - 20:00, Lun - Dom
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <h3 className="uppercase tracking-wide">Términos Legales</h3>
            <ul className="space-y-1">
              <li className="">
                <Link
                  href="/policies/returns"
                  className="flex items-center gap-2 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell"
                >
                  Políticas de devolución o cambio
                </Link>
              </li>
              <li className="">
                <Link
                  href="/policies/shipping"
                  className="flex items-center gap-2 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell"
                >
                  Políticas de entrega
                </Link>
              </li>
              <li className="">
                <Link
                  href="/policies/data"
                  className="flex items-center gap-2 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell"
                >
                  Políticas de tratamiento de datos
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <h3 className="uppercase tracking-wide">Redes Sociales</h3>
            <div className="flex justify-start space-x-3">
              <Link
                rel="noopener noreferrer"
                href="https://instagram.com/papeleria.pdepapel?igshid=OGQ5ZDc2ODk2ZA=="
                title="Facebook"
                className="flex items-center p-1 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell"
                target="_blank"
              >
                <Icons.facebook className="h-5 w-5" />
              </Link>
              <Link
                rel="noopener noreferrer"
                href="https://instagram.com/papeleria.pdepapel?igshid=OGQ5ZDc2ODk2ZA=="
                title="Instagram"
                className="flex items-center p-1 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell"
                target="_blank"
              >
                <Icons.instagram className="h-5 w-5" />
              </Link>
              <Link
                rel="noopener noreferrer"
                href="https://www.tiktok.com/@papeleria.pdepapel?_t=8gctJXIdqD7&_r=1"
                title="TikTok"
                className="flex items-center p-1 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell"
                target="_blank"
              >
                <Icons.tiktok className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="py-6 text-center text-sm">
        &copy; {new Date().getFullYear()} P de papel. Todos los derechos
        reservados.
      </div>
    </footer>
  );
};
