import { computed, type Ref } from 'vue'
import type { ForumPost } from '@/types'

export interface ThreadedPost extends ForumPost {
  depth: number
}

export function usePostThread(posts: Ref<ForumPost[]>) {
  /**
   * Calculate the depth (nesting level) of a post in the thread
   * Max depth is 4 to prevent excessive indentation
   */
  function calculateDepth(post: ForumPost, allPosts: ForumPost[]): number {
    if (!post.parent_post_id) return 0

    // Find the parent post
    const parent = allPosts.find((p) => p.id === post.parent_post_id)
    if (!parent) return 0

    // Recursively calculate parent's depth
    const parentDepth = calculateDepth(parent, allPosts)

    // Limit max depth to 4 (Reddit-style)
    return Math.min(parentDepth + 1, 4)
  }

  /**
   * Transform posts array to include depth information
   */
  const threadedPosts = computed<ThreadedPost[]>(() => {
    return posts.value.map((post) => ({
      ...post,
      depth: calculateDepth(post, posts.value),
    }))
  })

  /**
   * Find the parent post for a given post
   */
  function getParentPost(postId: number): ForumPost | null {
    const post = posts.value.find((p) => p.id === postId)
    if (!post || !post.parent_post_id) return null
    return posts.value.find((p) => p.id === post.parent_post_id) || null
  }

  return {
    threadedPosts,
    getParentPost,
    calculateDepth,
  }
}
