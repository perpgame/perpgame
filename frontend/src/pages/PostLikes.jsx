import { useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getPostLikes } from '../api/backend'
import PageHeader from '../components/PageHeader'
import { ExploreListSkeleton } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import UserListItem from '../components/UserListItem'

export default function PostLikes() {
  const { postId } = useParams()
  const [likers, setLikers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getPostLikes(postId)
      .then(setLikers)
      .catch(() => setLikers([]))
      .finally(() => setLoading(false))
  }, [postId])

  return (
    <div>
      <PageHeader title="Liked by" showBack />

      {loading ? (
        <ExploreListSkeleton count={4} />
      ) : likers.length === 0 ? (
        <EmptyState
          title="No likes yet"
          subtitle="When people like this post, they'll show up here."
        />
      ) : (
        likers.map(liker => (
          <UserListItem key={liker.address} user={liker} />
        ))
      )}
    </div>
  )
}
