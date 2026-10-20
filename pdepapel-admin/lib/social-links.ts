/** Las redes de la tienda, en el mismo orden que la tienda (`pdepapel-store/lib/social-links.ts`). */
export const STORE_SOCIAL_LINKS = [
  { network: "instagram", label: "Instagram", url: "https://instagram.com/papeleria.pdepapel" },
  { network: "tiktok", label: "TikTok", url: "https://tiktok.com/@papeleria.pdepapel" },
  { network: "facebook", label: "Facebook", url: "https://www.facebook.com/papeleriapdepapel/" },
  { network: "youtube", label: "YouTube", url: "https://www.youtube.com/@papeleriapdepapel" },
] as const;

/** El pie de redes del texto plano de un correo a clientes (la parte `text`). */
export const socialLinksText = () => `Síguenos: ${STORE_SOCIAL_LINKS.map((link) => `${link.label} ${link.url}`).join(" · ")}`;

export const withSocialLinks = (text: string) => `${text}\n\n${socialLinksText()}`;

/** Las redes en una línea de texto, para PDFs y textos planos: «Instagram: instagram.com/papeleria.pdepapel · …». */
export const socialLinksLine = () => STORE_SOCIAL_LINKS.map((link) => `${link.label}: ${link.url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}`).join(" · ");
