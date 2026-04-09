import { useState, useEffect } from 'react'
import { getAdminErrorLogs, clearAdminErrorLogs } from '../api/backend'
import { Button } from '../components/ui/button'

export default function ErrorLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())

  const load = async () => {
    setLoading(true)
    try {
      const data = await getAdminErrorLogs(200)
      setLogs(data || [])
    } catch {
      setLogs([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleClear = async () => {
    await clearAdminErrorLogs()
    setLogs([])
  }

  const toggleExpand = (i) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  return (
    <div className="error-logs-page">
      <div className="error-logs-header">
        <span className="section-title">Backend Error Logs</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="section-count">{logs.length}</span>
          <Button size="sm" variant="outline" radius="md" onClick={load} disabled={loading}>
            Refresh
          </Button>
          {logs.length > 0 && (
            <Button size="sm" radius="md" className="bg-[var(--loss-red)] text-white font-bold" onClick={handleClear}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="admin-loading">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="admin-empty">No errors logged</div>
      ) : (
        <div className="error-logs-list">
          {logs.map((entry, i) => (
            <div key={i} className={`error-log-entry error-log-source-${entry.source}`}>
              <div className="error-log-meta">
                <span className="error-log-source">{entry.source}</span>
                <span className="error-log-ts">{new Date(entry.ts).toLocaleString()}</span>
              </div>
              <div className="error-log-message">{entry.message}</div>
              {entry.stack && (
                <div
                  className="error-log-stack"
                  onClick={() => toggleExpand(i)}
                >
                  {expanded.has(i) ? entry.stack : entry.stack.split('\n').slice(0, 3).join('\n') + (entry.stack.split('\n').length > 3 ? '\n  ...' : '')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
