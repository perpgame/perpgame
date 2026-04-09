import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { getUserDisplayName, getUserHandle } from '../utils/user'

export default function UserListItem({ user }) {
  return (
    <Link
      to={`/profile/${user.address}`}
      className="user-list-item"
    >
      <Avatar address={user.address} size={40} avatarUrl={user.avatarUrl} />
      <div className="user-list-item-info">
        <div className="user-list-item-name">
          {getUserDisplayName(user)}
        </div>
        <div className="user-list-item-handle">
          {getUserHandle(user)}
        </div>
      </div>
    </Link>
  )
}
