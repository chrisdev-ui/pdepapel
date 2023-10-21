import { Icons } from "@/components/icons";
import { Container } from "@/components/ui/container";

interface Feature {
  title: string;
  description: string;
  icon: JSX.Element;
}

const features: Feature[] = [
  {
    title: "Catálogo de productos",
    description: "¡Descubre todos los productos que tenemos para ti!",
    icon: <Icons.catalog className="h-16 w-16 text-pink-shell" />,
  },
  {
    title: "Envíos",
    description: "¡Realizamos envíos a todo el país!",
    icon: <Icons.truck className="h-16 w-16 text-pink-shell" />,
  },
  {
    title: "Ofertas especiales",
    description: "¡Descubre nuestros precios en combos y productos!",
    icon: <Icons.discount className="h-16 w-16 text-pink-shell" />,
  },
  {
    title: "Métodos de pago",
    description: "¡Paga con tarjeta de crédito o débito!",
    icon: <Icons.creditCards className="h-16 w-16 text-pink-shell" />,
  },
  {
    title: "Atención al cliente",
    description: "¡Contáctanos para cualquier duda o sugerencia!",
    icon: <Icons.support className="h-16 w-16 text-pink-shell" />,
  },
];

export const Features: React.FC<{}> = () => {
  return (
    <Container>
      <div className="flex w-full flex-wrap items-center justify-between gap-y-6 sm:gap-y-0">
        {features.map(({ title, description, icon }, index) => (
          <div
            key={title}
            className="flex flex-col-reverse items-center gap-3 md:w-[calc(100%/5_-_1.5rem)] lg:flex-row lg:gap-0"
          >
            <div className="flex grow-0 items-start justify-center self-stretch lg:self-auto lg:pr-3">
              {icon}
            </div>
            <div className="flex grow flex-col gap-2">
              <span className="text-center font-serif text-sm font-semibold lg:text-left">
                {title}
              </span>
              <span className="hidden text-left text-xs lg:block">
                {description}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
};
