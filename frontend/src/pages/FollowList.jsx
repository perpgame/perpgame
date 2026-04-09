import { useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getFollowers, getFollowing } from '../api/backend'
import PageHeader from '../components/PageHeader'
import { ExploreListSkeleton } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import UserListItem from '../components/UserListItem'

const CONFIG = {
  followers: {
    title: 'Followers',
    fetch: getFollowers,
    emptyTitle: 'No followers yet',
    emptySubtitle: "When people follow this account, they'll show up here.",
  },
  following: {
    title: 'Following',
    fetch: getFollowing,
    emptyTitle: 'Not following anyone',
    emptySubtitle: "When this account follows people, they'll show up here.",
  },
}

export default function FollowList() {
  const { address, type } = useParams()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const config = CONFIG[type] || CONFIG.followers

  useEffect(() => {
    setLoading(true)
    config.fetch(address)
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [address, type])

  return (
    <div>
      <PageHeader title={config.title} showBack />

      {loading ? (
        <ExploreListSkeleton count={6} />
      ) : users.length === 0 ? (
        <EmptyState
          title={config.emptyTitle}
          subtitle={config.emptySubtitle}
        />
      ) : (
        users.map(user => (
          <UserListItem key={user.address} user={user} />
        ))
      )}
    </div>
  )
}
