import { NavigationLink } from "@/components/navigation-link";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Icons } from "./icons";

export const Navbar: React.FC<{}> = () => {
  return (
    <section className="relative mx-auto">
      <nav className="flex w-screen justify-between bg-white-rock">
        <div className="flex w-full items-center px-5 py-3 lg:py-6 xl:px-12">
          <Link href="/" className="relative h-24 w-48">
            <Image
              src="/images/text-beside-transparent-bg.webp"
              alt="Navbar Logo"
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              priority
            />
          </Link>
          <ul className="mx-auto hidden space-x-12 px-4 lg:flex">
            <li>
              <NavigationLink href="/">Inicio</NavigationLink>
            </li>
            <li>
              <NavigationLink href="/shop">Tienda</NavigationLink>
            </li>
            <li>
              <NavigationLink href="/about">Nosotros</NavigationLink>
            </li>
            <li>
              <NavigationLink href="/contact">Contacto</NavigationLink>
            </li>
          </ul>
          <div className="hidden items-center space-x-5 xl:flex">
            <Link href="#" className="hover:opacity-75">
              <Icons.heart className="h-6 w-6" />
            </Link>
            <Button className="flex w-auto items-center rounded-full border-transparent bg-blue-yankees px-4 py-2 font-semibold text-white transition hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50">
              <ShoppingBag className="h-5 w-5" />
              <span className="ml-2 flex pt-1 font-serif text-base font-medium">
                0
              </span>
            </Button>
            <Link href="#" className="hover:opacity-75">
              <Icons.user className="h-6 w-6" />
            </Link>
          </div>
        </div>
      </nav>
    </section>
  );
};
