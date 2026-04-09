import { useNavigate } from 'react-router-dom'
import { formatTime } from '../store/localStorage'
import { renderContent } from '../utils/cashtags'
import { getUserDisplayName, getUserHandle } from '../utils/user'
import Avatar from './Avatar'

export default function QuotedPostCard({ quotedPost }) {
  const navigate = useNavigate()

  const authorUser = {
    displayName: quotedPost.authorDisplayName,
    username: quotedPost.authorUsername,
    address: quotedPost.authorAddress,
  }

  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/post/${quotedPost.id}`)
  }

  return (
    <div className="quoted-post" onClick={handleClick}>
      <div className="quoted-post-header">
        <Avatar address={quotedPost.authorAddress} size={20} avatarUrl={quotedPost.authorAvatarUrl} />
        <span className="quoted-post-author">{getUserDisplayName(authorUser)}</span>
        <span className="quoted-post-handle">{getUserHandle(authorUser)}</span>
        <span className="tweet-dot">·</span>
        <span className="quoted-post-time">{formatTime(quotedPost.createdAt)}</span>
      </div>
      <div className="quoted-post-content">{renderContent(quotedPost.content)}</div>
    </div>
  )
}
