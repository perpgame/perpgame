import { getUserReferral } from '../api/hyperliquid'

export const POINT_VALUES = {
  account: 50,
  invite: 200,
  hl_referral: 500,
}

export const ACTION_LABELS = {
  account: 'Create Account',
  invite: 'Invite a Friend',
  hl_referral: 'Get a Fee Discount on HyperLiquid',
}

export async function checkHlReferral(address) {
  try {
    const data = await getUserReferral(address)
    return data?.referredBy?.code === 'PERPGAME'
  } catch {
    return false
  }
}
