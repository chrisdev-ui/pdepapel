import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { Metadata } from "next";

import { Wishlist } from "./components/wishlist";

export const metadata: Metadata = {
  title: "Tu lista de deseos",
  description:
    "Guarda y organiza tus artículos favoritos en la lista de deseos de Papelería P de Papel. Explora y selecciona productos kawaii y de oficina para añadir a tu lista personalizada. Perfecta para planificar futuras compras o compartir tus gustos con amigos y familiares. ¡Haz realidad tus deseos de papelería!",
  alternates: {
    canonical: "/wishlist",
  },
};

export default function WishlistPage() {
  return (
    <Container className="px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumb
        items={[{ label: "Lista de deseos", isCurrent: true }]}
        className="mb-6"
      />
      <Wishlist />
    </Container>
  );
}
