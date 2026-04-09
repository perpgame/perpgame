import { useToast } from '../components/Toast'

export function useVerifiedAuth(user) {
  const toast = useToast()
  const isVerified = user?.verified === true
  const isReadOnly = !isVerified

  const requireVerified = (action, actionName = 'This action') => {
    return (...args) => {
      if (isReadOnly) {
        toast.error(`${actionName} requires wallet verification. Please sign in with your wallet to unlock full access.`)
        return
      }
      return action(...args)
    }
  }

  return { isVerified, isReadOnly, requireVerified }
}
