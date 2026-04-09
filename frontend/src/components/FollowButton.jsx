import { Button } from './ui/button'

export default function FollowButton({ following, onClick, size = 'sm' }) {
  const btnSize = size === 'compact' ? 'sm' : size
  const handlePress = () => onClick?.()

  if (following) {
    return (
      <Button variant="outline"
        size={btnSize}
        onClick={handlePress}
        className="rounded-full border-[var(--border)] text-[var(--text)] font-bold hover:border-[var(--loss-red)] hover:text-[var(--loss-red)]"
      >
        Following
      </Button>
    )
  }

  return (
    <Button size={btnSize}
      onClick={handlePress}
      className="rounded-full bg-[var(--text)] text-[var(--bg)] font-bold hover:bg-[#d7dbdc]"
    >
      Follow
    </Button>
  )
}
