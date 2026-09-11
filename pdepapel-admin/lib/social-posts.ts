import { Social } from "@prisma/client";

/**
 * Reglas de las publicaciones de redes sociales que se incrustan en la
 * página "Nosotros" de la tienda en línea.
 *
 * Compartido por la API (`/api/[storeId]/posts`) y el formulario del panel:
 * acepta un identificador suelto o el enlace pegado de la publicación,
 * extrae el identificador y construye la URL canónica que la tienda usa
 * para el embed. Sin dependencias de servidor: se puede importar desde
 * componentes cliente.
 */

/** Usuario de la tienda en las redes donde la URL del embed lo necesita. */
export const STORE_SOCIAL_HANDLE = "papeleria.pdepapel";

/**
 * Redes que la tienda en línea sabe mostrar (`nosotros/components/social-media.tsx`).
 * `Twitter` sigue en el enum de Prisma por los registros antiguos, pero la
 * tienda no tiene cuenta en X y la tienda en línea ya no la renderiza.
 */
export const SUPPORTED_SOCIALS = [
  Social.Instagram,
  Social.TikTok,
  Social.Facebook,
  Social.Youtube,
  Social.Pinterest,
] as const;

export type SupportedSocial = (typeof SUPPORTED_SOCIALS)[number];

export const SOCIAL_LABELS: Record<Social, string> = {
  Instagram: "Instagram",
  TikTok: "TikTok",
  Facebook: "Facebook",
  Youtube: "YouTube",
  Pinterest: "Pinterest",
  Twitter: "X (Twitter)",
};

/** Dónde encontrar el identificador, por red. Se muestra en el formulario. */
export const SOCIAL_ID_HELP: Record<Social, string> = {
  Instagram:
    "Pega el enlace de la publicación o el código que va después de /p/ (por ejemplo, instagram.com/p/CxYz123AbCd/).",
  TikTok:
    "Pega el enlace del video o el número que va después de /video/ (por ejemplo, tiktok.com/@usuario/video/7234567890123456789).",
  Facebook:
    "Pega el enlace de la publicación o el número que va después de /posts/ (también sirve el código pfbid…).",
  Youtube:
    "Pega el enlace del video o el código de 11 caracteres que va después de watch?v= (por ejemplo, youtu.be/dQw4w9WgXcQ).",
  Pinterest:
    "Pega el enlace del pin o el número que va después de /pin/ (por ejemplo, pinterest.com/pin/123456789012345678/).",
  Twitter:
    "Pega el enlace de la publicación o el número que va después de /status/.",
};

const SOCIAL_ERRORS: Record<Social, string> = {
  Instagram:
    "No parece un identificador de Instagram. Pega el enlace de la publicación o el código que va después de /p/.",
  TikTok:
    "No parece un identificador de TikTok. Pega el enlace del video o el número que va después de /video/.",
  Facebook:
    "No parece un identificador de Facebook. Pega el enlace de la publicación o el número que va después de /posts/.",
  Youtube:
    "No parece un identificador de YouTube. Pega el enlace del video o el código de 11 caracteres que va después de watch?v=.",
  Pinterest:
    "No parece un identificador de Pinterest. Pega el enlace del pin o el número que va después de /pin/.",
  Twitter:
    "No parece un identificador de X (Twitter). Pega el enlace de la publicación o el número que va después de /status/.",
};

/** La tienda incrusta las publicaciones en "Nosotros" (`/nosotros`). */
export const POSTS_REVALIDATION = {
  paths: ["/nosotros"],
  tags: ["posts"],
} as const;

export const UNSUPPORTED_SOCIAL_MESSAGE =
  "Esta red social ya no se muestra en la tienda. Elige Instagram, TikTok, Facebook, YouTube o Pinterest.";

export type ParsedSocialPostId =
  | { ok: true; postId: string }
  | { ok: false; error: string };

interface SocialRule {
  /** Dominios (sin `www.`) cuyos enlaces se aceptan para esta red. */
  hosts: readonly string[];
  /** Patrones aplicados sobre `pathname + search` del enlace; el grupo 1 es el id. */
  urlPatterns: readonly RegExp[];
  /** Forma válida de un identificador suelto. */
  bareId: RegExp;
}

const RULES: Record<Social, SocialRule> = {
  Instagram: {
    hosts: ["instagram.com", "instagr.am"],
    urlPatterns: [/^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/],
    bareId: /^[A-Za-z0-9_-]{5,}$/,
  },
  TikTok: {
    hosts: ["tiktok.com"],
    urlPatterns: [/\/video\/(\d{15,25})/, /\/photo\/(\d{15,25})/],
    bareId: /^\d{15,25}$/,
  },
  Facebook: {
    hosts: ["facebook.com", "fb.com", "m.facebook.com", "fb.watch"],
    urlPatterns: [
      /\/posts\/(pfbid[A-Za-z0-9]+|\d{6,})/,
      /\/permalink\/(\d{6,})/,
      /\/videos\/(?:[^/]+\/)?(\d{6,})/,
      /\/photos\/(?:[^/]+\/)?(\d{6,})/,
      /[?&](?:story_fbid|fbid|v)=(pfbid[A-Za-z0-9]+|\d{6,})/,
    ],
    bareId: /^(?:pfbid[A-Za-z0-9]+|\d{6,})$/,
  },
  Youtube: {
    hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    urlPatterns: [
      /[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)/,
      /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/,
      /^\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/,
    ],
    bareId: /^[A-Za-z0-9_-]{11}$/,
  },
  Pinterest: {
    hosts: ["pinterest.com", "pinterest.es", "pinterest.com.mx", "pinterest.co"],
    urlPatterns: [/\/pin\/(\d{6,})/],
    bareId: /^\d{6,}$/,
  },
  Twitter: {
    hosts: ["twitter.com", "x.com", "mobile.twitter.com"],
    urlPatterns: [/\/status\/(\d{10,})/],
    bareId: /^\d{10,}$/,
  },
};

export function isSupportedSocial(value: unknown): value is SupportedSocial {
  return (
    typeof value === "string" &&
    (SUPPORTED_SOCIALS as readonly string[]).includes(value)
  );
}

export function isSocial(value: unknown): value is Social {
  return (
    typeof value === "string" &&
    (Object.values(Social) as string[]).includes(value)
  );
}

function looksLikeUrl(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value) || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(value) || /^www\./i.test(value);
}

function parseUrl(value: string): URL | null {
  const withScheme = /^(?:https?:)?\/\//i.test(value)
    ? value.replace(/^\/\//, "https://")
    : `https://${value}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function hostMatches(host: string, allowed: readonly string[]): boolean {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return allowed.some(
    (candidate) =>
      normalized === candidate || normalized.endsWith(`.${candidate}`),
  );
}

/**
 * Normaliza lo que escribió la persona (id suelto o enlace pegado) al
 * identificador que la tienda usa para el embed.
 */
export function parseSocialPostId(
  social: Social,
  rawInput: string | null | undefined,
): ParsedSocialPostId {
  const rule = RULES[social];
  if (!rule) {
    return { ok: false, error: "La red social es inválida" };
  }

  const input = (rawInput ?? "").trim();
  if (!input) {
    return {
      ok: false,
      error: "El identificador de la publicación es requerido",
    };
  }

  if (looksLikeUrl(input)) {
    const url = parseUrl(input);
    if (!url || !hostMatches(url.hostname, rule.hosts)) {
      return { ok: false, error: SOCIAL_ERRORS[social] };
    }
    const target = `${url.pathname}${url.search}`;
    for (const pattern of rule.urlPatterns) {
      const match = target.match(pattern);
      if (match?.[1]) {
        return { ok: true, postId: match[1] };
      }
    }
    return { ok: false, error: SOCIAL_ERRORS[social] };
  }

  if (rule.bareId.test(input)) {
    return { ok: true, postId: input };
  }

  return { ok: false, error: SOCIAL_ERRORS[social] };
}

/** URL pública de la publicación, la misma que usa la tienda para el embed. */
export function buildSocialPostUrl(social: Social, postId: string): string {
  const id = encodeURIComponent(postId);
  switch (social) {
    case Social.Instagram:
      return `https://www.instagram.com/p/${id}/`;
    case Social.TikTok:
      return `https://www.tiktok.com/@${STORE_SOCIAL_HANDLE}/video/${id}`;
    case Social.Facebook:
      return `https://www.facebook.com/${STORE_SOCIAL_HANDLE}/posts/${id}`;
    case Social.Youtube:
      return `https://www.youtube.com/watch?v=${id}`;
    case Social.Pinterest:
      return `https://www.pinterest.com/pin/${id}/`;
    case Social.Twitter:
      // La tienda no tiene cuenta en X; /i/status/ resuelve sin usuario.
      return `https://x.com/i/status/${id}`;
    default:
      return "";
  }
}
