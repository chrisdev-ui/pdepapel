import dynamic from "next/dynamic";
import { getPosts } from "./server/get-posts";

const PostClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Publicaciones | PdePapel Admin",
  description: "Gestión de publicaciones",
};

export default async function PostsPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const posts = await getPosts(params.storeId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <PostClient data={posts} />
      </div>
    </div>
  );
}
