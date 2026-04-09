import { useState, useCallback, useRef } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { buildExchangeTypedData, buildL1TypedData } from '../utils/hlSigning'
import {
  postExchange,
  buildOrderAction,
  buildLimitOrderAction,
  buildOrderWithTpSlAction,
  buildLeverageAction,
  buildApproveBuilderFeeAction,
  buildApproveAgentAction,
  buildCancelAction,
  buildTriggerOrderAction,
  buildUpdateIsolatedMarginAction,
} from '../api/hlExchange'
import { BUILDER_WALLET, BUILDER_FEE_BPS, ORDER_TYPES, ORDER_SIDES, HL_CHAIN, HL_TESTNET } from '../config/hyperliquid'

const MAX_DECIMALS = 6
const MIN_ORDER_SIZE_USD = 10.25

/**
 * Snap price with 10% slippage for IOC market fills.
 * Matches plug-core snapPriceToTick: Decimal(price).mul(multiplier).toSignificantDigits(5).toFixed(decimalPlaces)
 *
 * Uses string manipulation to match Decimal.js toSignificantDigits(5) behaviour
 * without a big-decimal dependency.
 */
function snapPrice(markPrice, isBuy, szDecimals) {
  const multiplier = isBuy ? 1.1 : 0.9
  const decimalPlaces = MAX_DECIMALS - szDecimals
  const raw = markPrice * multiplier
  const sig = Number(raw.toPrecision(5))
  return sig.toFixed(decimalPlaces)
}

/**
 * Estimate liquidation price for a new order.
 * Ported exactly from plug-core useCreateOrder.ts lines 246-261.
 *
 * Formula:
 *   floatSide          = long ? 1 : -1
 *   notional            = size * markPrice
 *   initialMargin       = notional / leverage
 *   maintenanceLeverage = maxLeverage * 2
 *   correction          = 1 - floatSide / maintenanceLeverage
 *   liqPrice            = markPrice - (floatSide * (initialMargin - notional / maintenanceLeverage)) / size / correction
 */
export function estimateLiquidationPrice({ markPrice, size, leverage, maxLeverage, isLong }) {
  if (!markPrice || !size || size <= 0 || !leverage || !maxLeverage) return null

  const floatSide = isLong ? 1 : -1
  const notional = size * markPrice
  const initialMargin = notional / leverage
  const maintenanceLeverage = maxLeverage * 2
  const correction = 1 - floatSide / maintenanceLeverage

  const liqPrice =
    markPrice -
    (floatSide * (initialMargin - notional / maintenanceLeverage)) / size / correction

  return liqPrice > 0 ? liqPrice : null
}

/**
 * Get or create a local agent wallet for the given user address.
 * Agent keys are stored in localStorage. Agents can trade but not withdraw.
 */
const NET = HL_CHAIN.toLowerCase()

function getOrCreateAgentKey(address) {
  const key = `hl_agent_key_${NET}_${address}`
  let pk = localStorage.getItem(key)
  if (!pk) {
    pk = generatePrivateKey()
    localStorage.setItem(key, pk)
  }
  return pk
}

/**
 * Sign EIP-712 typed data locally with the agent's private key.
 * Avoids wallet interaction and chainId validation entirely.
 */
async function signWithAgent(agentAccount, typedData) {
  return agentAccount.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  })
}

/**
 * Sign EIP-712 typed data via the wallet (for L1 actions with matching chainId).
 */
async function signWithWallet(walletClient, typedData) {
  return walletClient.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  })
}

export function useHlTrading({ refresh }) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const activeRef = useRef(false)
  const agentRef = useRef(null)

  const clearError = useCallback(() => setError(null), [])

  /** Get or create the agent account (cached in ref). */
  const getAgent = useCallback(() => {
    if (!address) return null
    if (agentRef.current?.address && agentRef.current._forAddress === address) {
      return agentRef.current
    }
    const pk = getOrCreateAgentKey(address)
    const account = privateKeyToAccount(pk)
    account._forAddress = address
    agentRef.current = account
    return account
  }, [address])

  /** Sign an exchange action locally with the agent key and submit. */
  const signAndSubmit = useCallback(async (action) => {
    const agent = getAgent()
    const nonce = Date.now()
    const typedData = buildExchangeTypedData(action, nonce)
    const signature = await signWithAgent(agent, typedData)
    return postExchange(action, nonce, signature)
  }, [getAgent])

  /** Sign an L1 action via the wallet (chainId matches active chain) and submit. */
  const signAndSubmitL1 = useCallback(async (action, types, primaryType) => {
    const typedData = buildL1TypedData({ action, types, primaryType })
    const signature = await signWithWallet(walletClient, typedData)
    return postExchange(action, action.nonce, signature)
  }, [walletClient])

  /**
   * One-time agent approval — registers the local agent key with HyperLiquid.
   * Uses L1 signing (chainId 42161) which the wallet accepts.
   */
  const ensureAgent = useCallback(async () => {
    const agent = getAgent()
    if (!agent) return
    const key = `hl_agent_approved_${NET}_${address}_${agent.address}`
    if (localStorage.getItem(key)) return

    const action = buildApproveAgentAction(agent.address)
    await signAndSubmitL1(
      action,
      [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'agentAddress', type: 'address' },
        { name: 'agentName', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
      'HyperliquidTransaction:ApproveAgent',
    )
    localStorage.setItem(key, '1')
  }, [address, getAgent, signAndSubmitL1])

  /**
   * One-time builder fee approval, persisted per address in localStorage.
   * Matches plug-core useApproveBuilderFee — always called before any order.
   */
  const ensureBuilderFee = useCallback(async () => {
    if (HL_TESTNET) return // Builder fee not needed on testnet
    const key = `hl_builder_approved_${NET}_${address}`
    if (localStorage.getItem(key)) return

    const action = buildApproveBuilderFeeAction(BUILDER_WALLET, `${BUILDER_FEE_BPS}%`)
    await signAndSubmitL1(
      action,
      [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'maxFeeRate', type: 'string' },
        { name: 'builder', type: 'address' },
        { name: 'nonce', type: 'uint64' },
      ],
      'HyperliquidTransaction:ApproveBuilderFee',
    )
    localStorage.setItem(key, '1')
  }, [address, signAndSubmitL1])

  /** Update leverage for an asset. Matches plug-core updateLeverage. */
  const updateLeverage = useCallback(async (assetId, leverage) => {
    const action = buildLeverageAction(assetId, leverage)
    await signAndSubmit(action)
  }, [signAndSubmit])

  /**
   * Place a new order (market or limit).
   * Flow:
   *   1. approveAgent() — one-time, signed by wallet (chainId 42161)
   *   2. approveBuilderFee() — one-time, signed by wallet (chainId 42161)
   *   3. updateLeverage — signed locally by agent (chainId 1337)
   *   4. sign & submit order — signed locally by agent (chainId 1337)
   */
  const placeOrder = useCallback(async ({
    side, orderType, leverage, margin, markPrice, limitPrice, assetId, szDecimals = 0,
    tpPrice, slPrice,
  }) => {
    if (activeRef.current || !walletClient || !address) return
    activeRef.current = true
    setLoading(true)
    setError(null)

    try {
      // Validate minimum order size (matches plug-core MIN_ORDER_SIZE_USD)
      const orderValue = margin * leverage
      if (orderValue < MIN_ORDER_SIZE_USD) {
        throw new Error(`Minimum order size is $${MIN_ORDER_SIZE_USD}`)
      }

      // 1. Approve agent (one-time, wallet signs with chainId 42161)
      await ensureAgent()

      // 2. Approve builder fee (one-time, wallet signs with chainId 42161)
      await ensureBuilderFee()

      // 3. Update leverage (agent signs locally with chainId 1337)
      await updateLeverage(assetId, leverage)

      // 4. Build order
      const isBuy = side === ORDER_SIDES.BUY
      // size = (margin * leverage) / price — matches plug-core: totalAmount.div(meta.price)
      const size = (orderValue / markPrice).toFixed(szDecimals || 4)

      const decimalPlaces = MAX_DECIMALS - szDecimals
      const hasTpSl = tpPrice || slPrice

      let action
      if (hasTpSl) {
        const entryPrice = orderType === ORDER_TYPES.LIMIT
          ? parseFloat(limitPrice).toFixed(decimalPlaces)
          : snapPrice(markPrice, isBuy, szDecimals)
        action = buildOrderWithTpSlAction({
          assetId,
          isBuy,
          price: entryPrice,
          size,
          orderType: orderType === ORDER_TYPES.LIMIT ? 'limit' : 'market',
          tpPrice: tpPrice ? parseFloat(tpPrice).toFixed(decimalPlaces) : null,
          slPrice: slPrice ? parseFloat(slPrice).toFixed(decimalPlaces) : null,
        })
      } else if (orderType === ORDER_TYPES.LIMIT) {
        action = buildLimitOrderAction({
          assetId,
          isBuy,
          price: parseFloat(limitPrice).toFixed(decimalPlaces),
          size,
        })
      } else {
        // Market order: IOC with 10% slippage (matches plug-core snapPriceToTick)
        action = buildOrderAction({
          assetId,
          isBuy,
          price: snapPrice(markPrice, isBuy, szDecimals),
          size,
        })
      }

      // 5. Sign and submit (agent signs locally)
      await signAndSubmit(action)

      // 6. Refresh positions/orders
      await refresh()
      return true
    } catch (err) {
      if (isUserRejection(err)) return false
      setError(err.message || 'Order failed')
      throw err
    } finally {
      setLoading(false)
      activeRef.current = false
    }
  }, [walletClient, address, ensureAgent, ensureBuilderFee, updateLeverage, signAndSubmit, refresh])

  /**
   * Close an open position (reduce-only IOC order).
   * Matches plug-core closePosition:
   *   - Always calls approveBuilderFee() first
   *   - Skips leverage update (publishOrder with skipUpdateLeverage=true)
   *   - Uses raw szi string for exact size
   *   - isBuy = !isLong (close long = sell, close short = buy)
   *   - Slippage: isLong ? 0.9 : 1.1 (opposite direction)
   */
  const closePosition = useCallback(async (position) => {
    if (activeRef.current || !walletClient || !address) return
    activeRef.current = true
    setLoading(true)
    setError(null)

    try {
      await ensureAgent()
      await ensureBuilderFee()

      const isLong = position.side === 'Long'
      const isBuy = !isLong
      const szDecimals = position.szDecimals || 0

      // Use raw szi string from API for exact size (matches plug-core: currentOrder.position.szi)
      // Fall back to formatted abs size if raw szi not available
      const rawSize = position.szi
        ? Math.abs(parseFloat(position.szi)).toString()
        : Math.abs(position.size).toString()

      const action = buildOrderAction({
        assetId: position.assetId,
        isBuy,
        // Slippage: long close → sell → 0.9x, short close → buy → 1.1x
        // Matches plug-core: parsedSize > 0 ? 0.9 : 1.1
        price: snapPrice(position.markPrice, isBuy, szDecimals),
        size: rawSize,
        reduceOnly: true,
      })

      // Skip leverage update (matches plug-core: publishOrder(order, true))
      await signAndSubmit(action)
      await refresh()
      return true
    } catch (err) {
      if (isUserRejection(err)) return false
      setError(err.message || 'Close failed')
      throw err
    } finally {
      setLoading(false)
      activeRef.current = false
    }
  }, [walletClient, address, ensureAgent, ensureBuilderFee, signAndSubmit, refresh])

  /** Cancel an open order. */
  const cancelOrder = useCallback(async (order) => {
    if (activeRef.current || !walletClient || !address) return
    activeRef.current = true
    setLoading(true)
    setError(null)

    try {
      await ensureAgent()
      const action = buildCancelAction(order.asset, order.oid)
      await signAndSubmit(action)
      await refresh()
      return true
    } catch (err) {
      if (isUserRejection(err)) return false
      setError(err.message || 'Cancel failed')
      throw err
    } finally {
      setLoading(false)
      activeRef.current = false
    }
  }, [walletClient, address, ensureAgent, signAndSubmit, refresh])

  /** Partial close — close a fraction of an open position. */
  const partialClose = useCallback(async (position, fraction) => {
    if (activeRef.current || !walletClient || !address) return
    activeRef.current = true
    setLoading(true)
    setError(null)

    try {
      await ensureAgent()
      await ensureBuilderFee()

      const isLong = position.side === 'Long'
      const isBuy = !isLong
      const szDecimals = position.szDecimals || 0
      const fullSize = position.szi
        ? Math.abs(parseFloat(position.szi))
        : Math.abs(position.size)
      const partialSize = (fullSize * fraction).toFixed(szDecimals || 4)

      const action = buildOrderAction({
        assetId: position.assetId,
        isBuy,
        price: snapPrice(position.markPrice, isBuy, szDecimals),
        size: partialSize,
        reduceOnly: true,
      })

      await signAndSubmit(action)
      await refresh()
      return true
    } catch (err) {
      if (isUserRejection(err)) return false
      setError(err.message || 'Partial close failed')
      throw err
    } finally {
      setLoading(false)
      activeRef.current = false
    }
  }, [walletClient, address, ensureAgent, ensureBuilderFee, signAndSubmit, refresh])

  /** Place TP and/or SL trigger orders on an existing position. */
  const setTpSl = useCallback(async (position, { tpPrice, slPrice }) => {
    if (activeRef.current || !walletClient || !address) return
    activeRef.current = true
    setLoading(true)
    setError(null)

    try {
      await ensureAgent()
      await ensureBuilderFee()

      const isLong = position.side === 'Long'
      const isBuy = !isLong
      const szDecimals = position.szDecimals || 0
      const decimalPlaces = MAX_DECIMALS - szDecimals
      const size = position.szi
        ? Math.abs(parseFloat(position.szi)).toString()
        : Math.abs(position.size).toString()

      if (tpPrice) {
        const action = buildTriggerOrderAction({
          assetId: position.assetId,
          isBuy,
          triggerPrice: parseFloat(tpPrice).toFixed(decimalPlaces),
          size,
          tpsl: 'tp',
        })
        await signAndSubmit(action)
      }

      if (slPrice) {
        const action = buildTriggerOrderAction({
          assetId: position.assetId,
          isBuy,
          triggerPrice: parseFloat(slPrice).toFixed(decimalPlaces),
          size,
          tpsl: 'sl',
        })
        await signAndSubmit(action)
      }

      await refresh()
      return true
    } catch (err) {
      if (isUserRejection(err)) return false
      setError(err.message || 'TP/SL failed')
      throw err
    } finally {
      setLoading(false)
      activeRef.current = false
    }
  }, [walletClient, address, ensureAgent, ensureBuilderFee, signAndSubmit, refresh])

  /** Add or remove isolated margin on a position. Amount is positive to add, negative to remove. */
  const adjustMargin = useCallback(async (position, amount) => {
    if (activeRef.current || !walletClient || !address) return
    activeRef.current = true
    setLoading(true)
    setError(null)

    try {
      await ensureAgent()

      // Ensure position is in isolated margin mode before adjusting
      const leverageAction = buildLeverageAction(position.assetId, Math.round(position.leverage))
      await signAndSubmit(leverageAction)

      const isBuy = position.side === 'Long'
      const action = buildUpdateIsolatedMarginAction(position.assetId, isBuy, amount)
      await signAndSubmit(action)
      await refresh()
      return true
    } catch (err) {
      if (isUserRejection(err)) return false
      setError(err.message || 'Margin adjustment failed')
      throw err
    } finally {
      setLoading(false)
      activeRef.current = false
    }
  }, [walletClient, address, ensureAgent, signAndSubmit, refresh])

  return { placeOrder, closePosition, partialClose, setTpSl, cancelOrder, updateLeverage, adjustMargin, loading, error, clearError }
}

function isUserRejection(err) {
  return err?.code === 4001
    || err?.message?.includes('User rejected')
    || err?.message?.includes('User denied')
}
