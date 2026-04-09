import { useState, useRef, useEffect } from 'react'
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'

import { shortenAddress } from '../store/localStorage'
import { createTip } from '../api/backend'
import { Modal } from './ui/modal'
import Avatar from './Avatar'
import { Button } from './ui/button'

const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const ARBITRUM_CHAIN_ID = 42161
const TIP_OPTIONS = [1, 3, 5, 10]

const erc20Abi = [{
  name: 'transfer',
  type: 'function',
  inputs: [
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ type: 'bool' }],
  stateMutability: 'nonpayable',
}]

export default function TipModal({ postId, authorAddress, onClose, onSuccess }) {
  const [amount, setAmount] = useState(null)
  const [sentAmount, setSentAmount] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const handledRef = useRef(false)

  const { chain } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync, data: txHash } = useWriteContract()
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (txConfirmed && !handledRef.current) {
      handledRef.current = true
      setStatus('verifying')
      createTip(postId, {
        toAddress: authorAddress,
        amount: sentAmount,
        txHash,
      }).then(() => {
        setStatus('success')
        if (onSuccess) onSuccess()
      }).catch((err) => {
        setStatus('error')
        setError(err.message || 'Backend verification failed')
      })
    }
  }, [txConfirmed, postId, authorAddress, txHash, onSuccess, sentAmount])

  const handleSend = async () => {
    if (!amount) return

    setError('')
    setSentAmount(amount)
    const amountStr = String(amount)

    try {
      if (chain?.id !== ARBITRUM_CHAIN_ID) {
        setStatus('switching')
        await switchChainAsync({ chainId: ARBITRUM_CHAIN_ID })
      }

      setStatus('sending')
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [authorAddress, parseUnits(amountStr, 6)],
        chainId: ARBITRUM_CHAIN_ID,
      })
    } catch (err) {
      setStatus('error')
      setError(err.shortMessage || err.message || 'Transaction failed')
    }
  }

  const busy = status === 'switching' || status === 'sending' || status === 'verifying'

  return (
    <Modal title="Send Tip" onClose={onClose} ariaLabel="Send tip">
      <div className="tip-modal-body">
        {status === 'success' ? (
          <div className="tip-success">
            <div className="tip-success-amount">{sentAmount} USDC</div>
            <div className="tip-success-sub">sent to {shortenAddress(authorAddress)}</div>
            <Button className="w-full rounded-lg bg-[var(--primary)] text-[#060a0e] font-bold" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <div className="tip-modal-to">
              To <span>{shortenAddress(authorAddress)}</span> · Arbitrum
            </div>

            <div className="tip-options">
              {TIP_OPTIONS.map(opt => (
                <Button
                  key={opt} variant={amount === opt ? 'solid' : 'bordered'}
                  className={`rounded-lg ${amount === opt ? 'bg-[var(--primary)] text-[#060a0e] font-bold' : 'border-[var(--border)] text-[var(--text)] font-bold'}`}
                  onClick={() => setAmount(opt)}
                  disabled={busy}
                >
                  {opt}
                </Button>
              ))}
            </div>

            {error && (
              <div className="tip-modal-status error">{error}</div>
            )}

            {busy && (
              <div className="tip-modal-status pending">
                {status === 'switching' ? 'Switching to Arbitrum...' :
                 status === 'verifying' ? 'Verifying on-chain...' :
                 'Confirm in wallet...'}
              </div>
            )}

            <Button className="w-full rounded-lg bg-[var(--primary)] text-[#060a0e] font-bold"
              onClick={handleSend}
              disabled={busy || !amount}
            >
              {busy ? 'Waiting...' : amount ? `Send ${amount} USDC` : 'Select amount'}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
