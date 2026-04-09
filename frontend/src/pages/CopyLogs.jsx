import { useState, useEffect } from 'react'

import { getLogs } from '../api/copyTrading'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import { Button } from '../components/ui/button'

export default function CopyLogs() {
  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())
  const toast = useToast()

  const load = async (p) => {
    try {
      const data = await getLogs(p)
      if (data) {
        setLogs(data.logs || [])
        setTotalPages(data.totalPages || 1)
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load logs')
    }
    setLoading(false)
  }

  useEffect(() => { load(1) }, [])

  const goToPage = (p) => {
    setPage(p)
    load(p)
  }

  const toggleMeta = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Copy Trading Logs" showBack />
        <div className="profile-gate">
          <div className="profile-gate-title">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Copy Trading Logs" showBack />

      {logs.length === 0 ? (
        <div className="copy-empty">
          <p className="copy-empty-title">No logs yet</p>
          <p className="copy-empty-desc">Trade execution logs will appear here once your wallets start copying trades.</p>
        </div>
      ) : (
        <>
          <div className="copy-trades-table-wrap">
            <table className="copy-trades-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Message</th>
                  <th>Meta</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.createdAt).toLocaleTimeString()}</td>
                    <td>
                      <span className={`copy-log-level copy-log-level--${log.level}`}>
                        {log.level}
                      </span>
                    </td>
                    <td>{log.message}</td>
                    <td>
                      {log.meta && (
                        <>
                          <button
                            className="copy-card-expand"
                            onClick={() => toggleMeta(log.id)}
                          >
                            {expanded.has(log.id) ? 'Hide' : 'Show'}
                          </button>
                          {expanded.has(log.id) && (
                            <pre className="copy-log-meta">{JSON.stringify(log.meta, null, 2)}</pre>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="copy-pagination">
              <Button
                size="sm" variant="outline"
                className="rounded-full border-[var(--border)] text-[var(--text)]"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                Prev
              </Button>
              <span className="copy-pagination-label">Page {page} of {totalPages}</span>
              <Button
                size="sm" variant="outline"
                className="rounded-full border-[var(--border)] text-[var(--text)]"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
