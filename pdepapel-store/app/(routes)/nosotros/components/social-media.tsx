"use client";

import { Social } from "@/constants";
import { Post } from "@/types";
import { useEffect, useState } from "react";
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

const SocialMedia: React.FC<SocialMediaProps> = ({ data }) => {
  const [posts, setPosts] = useState<Record<Social, Post[]> | null>(null);

  useEffect(() => {
    const separatePostsBySocial = () => {
      const separatedPosts = data
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
          <InstagramEmbed
            key={post.id}
            url={`https://www.instagram.com/p/${post.postId}/`}
            width={328}
          />
        ))}
      {posts?.TikTok &&
        posts?.TikTok?.map((post) => (
          <TikTokEmbed
            key={post.id}
            url={`https://www.tiktok.com/@papeleria.pdepapel/video/${post.postId}`}
            width={328}
          />
        ))}
      {posts?.Facebook &&
        posts?.Facebook?.map((post) => (
          <FacebookEmbed
            key={post.id}
            url={`https://www.facebook.com/papeleria.pdepapel/posts/${post.postId}}`}
            width={328}
          />
        ))}
      {posts?.Pinterest &&
        posts?.Pinterest?.map((post) => (
          <PinterestEmbed
            key={post.id}
            url={`https://www.pinterest.com/pin/${post.postId}/`}
            width={345}
          />
        ))}
      {posts?.Twitter &&
        posts?.Twitter?.map((post) => (
          <TwitterEmbed
            key={post.id}
            url={`https://twitter.com/papeleria.pdepapel/status/${post.postId}`}
            width={328}
          />
        ))}
      {posts?.Youtube &&
        posts?.Youtube?.map((post) => (
          <YouTubeEmbed
            key={post.id}
            url={`https://www.youtube.com/watch?v=${post.postId}`}
            width={400}
          />
        ))}
    </div>
  );
};

export default SocialMedia;
