import prismadb from '@/lib/prismadb'
import { format } from 'date-fns'
import { PostClient } from './components/client'
import { PostColumn } from './components/columns'

export default async function PostsPage({
  params
}: {
  params: {
    storeId: string
  }
}) {
  const posts = await prismadb.post.findMany({
    where: {
      storeId: params.storeId
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  const formattedPosts: PostColumn[] = posts.map((post) => ({
    id: post.id,
    social: post.social,
    postId: post.postId,
    createdAt: format(post.createdAt, 'MMMM d, yyyy')
  }))

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <PostClient data={formattedPosts} />
      </div>
    </div>
  )
}
