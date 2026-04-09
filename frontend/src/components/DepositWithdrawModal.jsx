import { useState, useEffect, useCallback } from 'react'
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from 'wagmi'
import { parseUnits } from 'viem'

import { buildWithdrawAction, postExchange } from '../api/hlExchange'
import { buildL1TypedData } from '../utils/hlSigning'
import { formatUsd } from '../api/hyperliquid'
import { Dialog, DialogContent, DialogBody, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const ARBITRUM_CHAIN_ID = 42161
const HL_BRIDGE_ADDRESS = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7'
const MIN_DEPOSIT = 5

export default function DepositWithdrawModal({ mode, withdrawableBalance, onClose, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  const { address, chain } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync, data: txHash } = useWriteContract()
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const isDeposit = mode === 'deposit'
  const parsedAmount = parseFloat(amount) || 0

  useEffect(() => {
    if (txConfirmed && isDeposit) {
      setStatus('success')
      if (onSuccess) onSuccess()
    }
  }, [txConfirmed, isDeposit, onSuccess])

  const validationError = useCallback(() => {
    if (!amount || parsedAmount <= 0) return 'Enter an amount'
    if (isDeposit && parsedAmount < MIN_DEPOSIT) return `Minimum deposit is $${MIN_DEPOSIT}`
    if (!isDeposit && parsedAmount > (withdrawableBalance || 0)) return 'Exceeds withdrawable balance'
    if (!isDeposit && parsedAmount < 1) return 'Minimum withdrawal is $1'
    return null
  }, [amount, parsedAmount, isDeposit, withdrawableBalance])

  const handleDeposit = async () => {
    setError('')
    try {
      if (chain?.id !== ARBITRUM_CHAIN_ID) {
        setStatus('switching')
        await switchChainAsync({ chainId: ARBITRUM_CHAIN_ID })
      }
      setStatus('sending')
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: [{
          name: 'transfer',
          type: 'function',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ type: 'bool' }],
          stateMutability: 'nonpayable',
        }],
        functionName: 'transfer',
        args: [HL_BRIDGE_ADDRESS, parseUnits(amount, 6)],
        chainId: ARBITRUM_CHAIN_ID,
      })
    } catch (err) {
      setStatus('error')
      setError(err.shortMessage || err.message || 'Transaction failed')
    }
  }

  const handleWithdraw = async () => {
    if (!walletClient || !address) return
    setError('')
    setStatus('signing')

    try {
      const action = buildWithdrawAction(amount, address)
      const typedData = buildL1TypedData({
        action,
        types: [
          { name: 'hyperliquidChain', type: 'string' },
          { name: 'destination', type: 'string' },
          { name: 'amount', type: 'string' },
          { name: 'time', type: 'uint64' },
        ],
        primaryType: 'HyperliquidTransaction:Withdraw',
      })

      const signature = await walletClient.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      })

      setStatus('submitting')
      await postExchange(action, action.time, signature)

      setStatus('success')
      if (onSuccess) onSuccess()
    } catch (err) {
      setStatus('error')
      const msg = err?.message || err?.shortMessage || 'Withdrawal failed'
      setError(msg.includes('User rejected') ? 'Transaction rejected' : msg)
    }
  }

  const handleSubmit = () => {
    if (validationError()) return
    if (isDeposit) handleDeposit()
    else handleWithdraw()
  }

  const handleMaxClick = () => {
    if (!isDeposit && withdrawableBalance > 0) {
      setAmount(String(Math.floor(withdrawableBalance * 100) / 100))
    }
  }

  const busy = ['switching', 'sending', 'signing', 'submitting'].includes(status)
  const statusText = {
    switching: 'Switching to Arbitrum...',
    sending: 'Confirm in wallet...',
    signing: 'Sign in wallet...',
    submitting: 'Submitting withdrawal...',
  }[status]

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
      <DialogBody>
      <div style={{ padding: 16 }}>
        {status === 'success' ? (
          <div className="tip-success">
            <div className="tip-success-amount">{amount} USDC</div>
            <div className="tip-success-sub">
              {isDeposit ? 'deposited to HyperLiquid' : 'withdrawal submitted'}
            </div>
            <Button className="w-full rounded-lg bg-[var(--primary)] text-[#060a0e] font-bold mt-4" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            {!isDeposit && withdrawableBalance > 0 && (
              <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
                Available: {formatUsd(withdrawableBalance)}
              </div>
            )}

            {isDeposit && (
              <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
                Send USDC on Arbitrum to HyperLiquid
              </div>
            )}

            <div className="dw-input-wrap">
              <input
                type="number"
                inputMode="decimal"
                className="dw-amount-input"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={busy}
                autoFocus
                min="0"
                step="0.01"
              />
              <span className="dw-currency">USDC</span>
              {!isDeposit && withdrawableBalance > 0 && (
                <button className="dw-max-btn" onClick={handleMaxClick} disabled={busy} type="button">
                  MAX
                </button>
              )}
            </div>

            {error && (
              <div className="tip-modal-status error">{error}</div>
            )}

            {busy && statusText && (
              <div className="tip-modal-status pending">{statusText}</div>
            )}

            <Button
              className="w-full rounded-lg bg-[var(--primary)] text-[#060a0e] font-bold mt-3"
              onClick={handleSubmit}
              disabled={busy || !!validationError()}
            >
              {busy ? 'Waiting...' : validationError() || (isDeposit ? `Deposit ${parsedAmount ? formatUsd(parsedAmount) : ''}` : `Withdraw ${parsedAmount ? formatUsd(parsedAmount) : ''}`)}
            </Button>
          </>
        )}
      </div>
      </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
