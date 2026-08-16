"use client";

import { Social } from "@/constants";
import { Post } from "@/types";
import { ReactNode, useEffect, useState } from "react";
import {
  FacebookEmbed,
  InstagramEmbed,
  PinterestEmbed,
  TikTokEmbed,
  TwitterEmbed,
  YouTubeEmbed,
} from "react-social-media-embed";

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

const SocialMedia: React.FC<SocialMediaProps> = ({ data }) => {
  const [posts, setPosts] = useState<Record<Social, Post[]> | null>(null);

  useEffect(() => {
    const separatePostsBySocial = () => {
      const separatedPosts = [...data]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .reduce(
          (acc, post) => {
            if (!acc[post.social]) {
              acc[post.social] = [];
            }
            acc[post.social].push(post);

            return acc;
          },
          {} as Record<Social, Post[]>,
        );
      setPosts(separatedPosts);
    };
    separatePostsBySocial();
  }, [data]);

  if (Object.keys(posts || {}).length === 0) {
    return null;
  }

  return (
    <div className="mt-10 flex w-full flex-wrap justify-center gap-x-10 gap-y-5 xl:justify-between xl:gap-0">
      {posts?.Instagram &&
        posts?.Instagram?.map((post) => (
          <SocialEmbedFrame key={post.id} maxWidth={328}>
            <InstagramEmbed
              url={`https://www.instagram.com/p/${post.postId}/`}
              width="100%"
            />
          </SocialEmbedFrame>
        ))}
      {posts?.TikTok &&
        posts?.TikTok?.map((post) => (
          <SocialEmbedFrame key={post.id} maxWidth={328}>
            <TikTokEmbed
              url={`https://www.tiktok.com/@papeleria.pdepapel/video/${post.postId}`}
              width="100%"
            />
          </SocialEmbedFrame>
        ))}
      {posts?.Facebook &&
        posts?.Facebook?.map((post) => (
          <SocialEmbedFrame key={post.id} maxWidth={328}>
            <FacebookEmbed
              url={`https://www.facebook.com/papeleria.pdepapel/posts/${post.postId}`}
              width="100%"
            />
          </SocialEmbedFrame>
        ))}
      {posts?.Pinterest &&
        posts?.Pinterest?.map((post) => (
          <SocialEmbedFrame key={post.id} maxWidth={345}>
            <PinterestEmbed
              url={`https://www.pinterest.com/pin/${post.postId}/`}
              width="100%"
            />
          </SocialEmbedFrame>
        ))}
      {posts?.Twitter &&
        posts?.Twitter?.map((post) => (
          <SocialEmbedFrame key={post.id} maxWidth={328}>
            <TwitterEmbed
              url={`https://twitter.com/papeleria.pdepapel/status/${post.postId}`}
              width="100%"
            />
          </SocialEmbedFrame>
        ))}
      {posts?.Youtube &&
        posts?.Youtube?.map((post) => (
          <SocialEmbedFrame key={post.id} maxWidth={400}>
            <YouTubeEmbed
              url={`https://www.youtube.com/watch?v=${post.postId}`}
              width="100%"
            />
          </SocialEmbedFrame>
        ))}
    </div>
  );
};

export default SocialMedia;
