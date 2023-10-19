import Image from "next/image";
import Link from "next/link";
import { NavigationLink } from "./navigation-link";

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
              sizes="100vw"
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
        </div>
      </nav>
    </section>
  );
};
