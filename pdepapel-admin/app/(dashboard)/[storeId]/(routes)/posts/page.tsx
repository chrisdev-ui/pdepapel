import { PostClient } from "./components/client";
import { getPosts } from "./server/get-posts";

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
