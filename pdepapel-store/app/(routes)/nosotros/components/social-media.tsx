"use client";

import { Social } from "@/constants";
import { Post } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  FacebookEmbed,
  InstagramEmbed,
  PinterestEmbed,
  TikTokEmbed,
  YouTubeEmbed,
} from "react-social-media-embed";

/** Usuario de la tienda en las redes cuyo embed lleva el usuario en la URL. */
const STORE_SOCIAL_HANDLE = "papeleria.pdepapel";

/**
 * Redes que esta sección sabe incrustar. Coincide con `SUPPORTED_SOCIALS`
 * del panel (`lib/social-posts.ts`): la tienda no tiene cuenta en X, así que
 * las publicaciones antiguas de Twitter se omiten.
 */
export const SUPPORTED_SOCIALS: readonly Social[] = [
  Social.Instagram,
  Social.TikTok,
  Social.Facebook,
  Social.Youtube,
  Social.Pinterest,
];

/** Máximo de embeds por página: cada uno carga un script de terceros. */
export const MAX_EMBEDS = 6;

const PLACEHOLDER_LINK_TEXT = "Ver publicación";

/** Filtra a las redes soportadas y deja las más recientes primero, con tope. */
export function selectPostsToDisplay(
  data: Post[],
  limit: number = MAX_EMBEDS,
): Post[] {
  return data
    .filter((post) => SUPPORTED_SOCIALS.includes(post.social))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

export function buildEmbedUrl(post: Post): string {
  const id = encodeURIComponent(post.postId);
  switch (post.social) {
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
    default:
      return "";
  }
}

interface SocialMediaProps {
  data: Post[];
}

interface SocialEmbedFrameProps {
  children: ReactNode;
  maxWidth: number;
}

function SocialEmbedFrame({ children, maxWidth }: SocialEmbedFrameProps) {
  return (
    <div
      className="w-full overflow-hidden"
      style={{ contain: "paint", maxWidth }}
    >
      {children}
    </div>
  );
}

function SocialEmbed({ post }: { post: Post }) {
  const url = buildEmbedUrl(post);
  switch (post.social) {
    case Social.Instagram:
      return (
        <SocialEmbedFrame maxWidth={328}>
          <InstagramEmbed
            url={url}
            width="100%"
            linkText={PLACEHOLDER_LINK_TEXT}
          />
        </SocialEmbedFrame>
      );
    case Social.TikTok:
      return (
        <SocialEmbedFrame maxWidth={328}>
          <TikTokEmbed url={url} width="100%" linkText={PLACEHOLDER_LINK_TEXT} />
        </SocialEmbedFrame>
      );
    case Social.Facebook:
      return (
        <SocialEmbedFrame maxWidth={328}>
          <FacebookEmbed
            url={url}
            width="100%"
            linkText={PLACEHOLDER_LINK_TEXT}
          />
        </SocialEmbedFrame>
      );
    case Social.Pinterest:
      return (
        <SocialEmbedFrame maxWidth={345}>
          <PinterestEmbed
            url={url}
            width="100%"
            linkText={PLACEHOLDER_LINK_TEXT}
          />
        </SocialEmbedFrame>
      );
    case Social.Youtube:
      return (
        <SocialEmbedFrame maxWidth={400}>
          <YouTubeEmbed
            url={url}
            width="100%"
            linkText={PLACEHOLDER_LINK_TEXT}
          />
        </SocialEmbedFrame>
      );
    default:
      return null;
  }
}

/**
 * Mientras no hay ventana (SSR e hidratación) se reserva el alto con el mismo
 * esqueleto que el `Suspense` de la página, para no mover el contenido cuando
 * los embeds de terceros aparecen.
 */
function SocialMediaPlaceholder({ count }: { count: number }) {
  return (
    <div
      className="mt-10 grid w-full gap-4 sm:grid-cols-3"
      aria-busy="true"
      aria-label="Cargando publicaciones de redes sociales"
      data-testid="social-media-placeholder"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="aspect-square rounded-2xl" />
      ))}
    </div>
  );
}

const SocialMedia: React.FC<SocialMediaProps> = ({ data }) => {
  const [mounted, setMounted] = useState(false);
  const posts = useMemo(() => selectPostsToDisplay(data), [data]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (posts.length === 0) {
    return null;
  }

  if (!mounted) {
    return <SocialMediaPlaceholder count={Math.min(posts.length, 3)} />;
  }

  return (
    <div
      className="mt-10 flex w-full flex-wrap justify-center gap-x-10 gap-y-5 xl:justify-between xl:gap-0"
      data-testid="social-media-embeds"
    >
      {posts.map((post) => (
        <SocialEmbed key={post.id} post={post} />
      ))}
    </div>
  );
};

export default SocialMedia;
