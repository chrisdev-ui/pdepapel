import { PostForm } from "./components/post-form";
import { getPost } from "./server/get-post";

export default async function PostPage({
  params,
}: {
  params: { postId: string };
}) {
  const post = await getPost(params.postId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <PostForm initialData={post} />
      </div>
    </div>
  );
}
