import { useState, useEffect } from 'react'
import { toggleFollow as apiToggleFollow } from '../api/backend'
import { useVerifiedAuth } from './useVerifiedAuth'
import { useToast } from '../components/Toast'

export function useFollow(currentUser, targetAddress, initialFollowing = false, onToggle) {
  const [following, setFollowing] = useState(initialFollowing)
  useEffect(() => { setFollowing(initialFollowing) }, [initialFollowing])
  const { requireVerified } = useVerifiedAuth(currentUser)
  const toast = useToast()

  const handleFollow = requireVerified(async () => {
    try {
      const result = await apiToggleFollow(targetAddress)
      setFollowing(result.following)
      if (onToggle) onToggle(result)
    } catch (err) {
      toast.error(err.message || 'Failed to follow')
    }
  }, 'Following')

  return { following, setFollowing, handleFollow }
}
