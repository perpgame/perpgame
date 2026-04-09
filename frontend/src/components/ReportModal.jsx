import { useState } from 'react'
import { RadioGroup, Radio } from './ui/radio-group'
import { Textarea } from './ui/textarea'
import { Modal } from './ui/modal'
import { reportContent } from '../api/backend'
import { useToast } from './Toast'
import { Button } from './ui/button'

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment / Abuse' },
  { value: 'scam', label: 'Scam / Fraud' },
  { value: 'other', label: 'Other' },
]

export default function ReportModal({ targetType, targetId, onClose }) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  const handleSubmit = async () => {
    if (!reason) return
    setSubmitting(true)
    try {
      await reportContent(targetType, targetId, reason, detail.trim() || null)
      toast.success('Report submitted')
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to submit report')
    }
    setSubmitting(false)
  }

  return (
    <Modal
      title={`Report ${targetType}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="rounded-lg text-[var(--text-secondary)] font-bold">Cancel</Button>
          <Button className="rounded-lg bg-[var(--primary)] text-[#060a0e] font-bold"
            onClick={handleSubmit}
            disabled={!reason || submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </>
      }
    >
      <RadioGroup
        value={reason}
        onValueChange={setReason}
      >
        {REASONS.map(r => (
          <Radio key={r.value} value={r.value}>
            {r.label}
          </Radio>
        ))}
      </RadioGroup>
      <Textarea
        placeholder="Additional details (optional)"
        value={detail}
        onValueChange={setDetail}
        maxLength={500}
        minRows={3}
        wrapperClassName="bg-[var(--surface)] mt-3"
      />
    </Modal>
  )
}
