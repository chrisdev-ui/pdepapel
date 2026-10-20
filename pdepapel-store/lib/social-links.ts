/**
 * Las redes de la tienda, en el orden en que se muestran en todas partes
 * (pie de página, Nosotros, «Entre ediciones», `sameAs` del JSON-LD).
 */
export const STORE_SOCIAL_LINKS = [
  { network: "instagram", label: "Instagram", url: "https://instagram.com/papeleria.pdepapel" },
  { network: "tiktok", label: "TikTok", url: "https://tiktok.com/@papeleria.pdepapel" },
  { network: "facebook", label: "Facebook", url: "https://www.facebook.com/papeleriapdepapel/" },
  { network: "youtube", label: "YouTube", url: "https://www.youtube.com/@papeleriapdepapel" },
] as const;

export type StoreSocialNetwork = (typeof STORE_SOCIAL_LINKS)[number]["network"];

const urlOf = (network: StoreSocialNetwork) => STORE_SOCIAL_LINKS.find((link) => link.network === network)!.url;

export const STORE_INSTAGRAM_URL = urlOf("instagram");
export const STORE_TIKTOK_URL = urlOf("tiktok");
export const STORE_FACEBOOK_URL = urlOf("facebook");
export const STORE_YOUTUBE_URL = urlOf("youtube");

export const socialAriaLabel = (label: string) => `${label} de P de Papel`;
