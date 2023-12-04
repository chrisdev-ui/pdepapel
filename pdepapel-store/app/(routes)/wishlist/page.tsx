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
  return <Wishlist />;
}
