import { notFound } from "next/navigation";

import { PostForm } from "./components/post-form";
import { getPost } from "./server/get-post";

const NEW_SEGMENTS = new Set(["nuevo", "new"]);

export default async function PostPage({
  params,
}: {
  params: { storeId: string; postId: string };
}) {
  const isNew = NEW_SEGMENTS.has(params.postId);
  const post = isNew ? null : await getPost(params.storeId, params.postId);

  if (!isNew && !post) {
    notFound();
  }

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <PostForm initialData={post} />
      </div>
    </div>
  );
}
