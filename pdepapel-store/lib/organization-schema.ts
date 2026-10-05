import type { Organization } from "schema-dts";

import { BASE_URL } from "@/constants";

/**
 * La organización, una sola vez para todo el sitio. Antes había tres copias
 * (inicio, nosotros, contacto) que no coincidían: solo contacto tenía la
 * dirección y solo las otras dos tenían las redes. Todos los datos son los que
 * ya se publican en la tienda (contacto y pie de página).
 */
export const ORGANIZATION_ID = `${BASE_URL}/#organization`;

export const organizationSchema = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "Papelería P de Papel",
  url: BASE_URL,
  logo: `${BASE_URL}/images/no-text-lightpink-bg.webp`,
  email: "papeleria.pdepapel@gmail.com",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+57-313-258-2293",
    email: "papeleria.pdepapel@gmail.com",
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
  sameAs: [
    "https://instagram.com/papeleria.pdepapel",
    "https://tiktok.com/@papeleria.pdepapel",
  ],
} satisfies Organization;
