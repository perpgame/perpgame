import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  getAdminStats, getAdminUsers, getAdminPosts, getAdminComments,
  getAdminLikes, getAdminFollows,
  getAdminReports, resolveReport,
} from '../api/backend'
import { shortenAddress, formatTime } from '../store/localStorage'
import { Button } from '../components/ui/button'

const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'posts', label: 'Posts' },
  { key: 'comments', label: 'Comments' },
  { key: 'likes', label: 'Likes' },
  { key: 'follows', label: 'Follows' },
  { key: 'reports', label: 'Reports' },
]

const FETCHERS = {
  users: getAdminUsers,
  posts: getAdminPosts,
  comments: getAdminComments,
  likes: getAdminLikes,
  follows: getAdminFollows,
  reports: getAdminReports,
}

const ADDRESS_FIELDS = new Set([
  'address', 'author_address', 'user_address', 'from_address', 'to_address',
  'follower_address', 'followed_address', 'referred_by',
])

const TIME_FIELDS = new Set(['joined_at', 'created_at', 'started_at', 'stopped_at'])

const JSON_FIELDS = new Set(['tags', 'attachment'])

const TRUNCATE_LEN = 60

function CellValue({ field, value }) {
  const [expanded, setExpanded] = useState(false)

  if (value === null || value === undefined) return <span className="admin-null">null</span>

  if (ADDRESS_FIELDS.has(field) && typeof value === 'string' && value.startsWith('0x')) {
    return <span className="admin-address" title={value}>{shortenAddress(value)}</span>
  }

  if (TIME_FIELDS.has(field) && typeof value === 'string' && value.length > 5) {
    return <span title={value}>{formatTime(value)}</span>
  }

  if (JSON_FIELDS.has(field) && typeof value === 'string' && value.length > TRUNCATE_LEN) {
    return (
      <span
        className="admin-json"
        onClick={() => setExpanded(!expanded)}
        title="Click to expand"
      >
        {expanded ? value : value.slice(0, TRUNCATE_LEN) + '...'}
      </span>
    )
  }

  return <>{String(value)}</>
}

function ReportActions({ report, onResolved }) {
  const [resolving, setResolving] = useState(false)

  const handleResolve = async (status, deleteContent = false) => {
    setResolving(true)
    try {
      await resolveReport(report.id, status, deleteContent)
      onResolved(report.id)
    } catch {
      setResolving(false)
    }
  }

  if (report.status !== 'pending') return <span>{report.status}</span>

  return (
    <div className="admin-report-actions">
      <Button size="sm" radius="md" className="bg-[var(--loss-red)] text-white font-bold" disabled={resolving} onClick={() => handleResolve('resolved', true)}>
        Delete Content
      </Button>
      <Button size="sm" variant="outline" radius="md" className="border-[var(--border)] text-[var(--text)] font-bold" disabled={resolving} onClick={() => handleResolve('dismissed')}>
        Dismiss
      </Button>
    </div>
  )
}

export default function Admin() {
  const [tab, setTab] = useState('users')
  const [stats, setStats] = useState(null)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAdminStats().then(setStats).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    FETCHERS[tab]()
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setData([]); setLoading(false) })
  }, [tab])

  const columns = data.length > 0 ? Object.keys(data[0]) : []

  return (
    <div>

      <div className="admin-quick-links">
        <Link to="/admin/error-logs" className="copy-header-link">Error Logs</Link>
      </div>

      {stats && (
        <div className="admin-stats">
          {Object.entries(stats).map(([key, val]) => (
            <div key={key} className="admin-stat-card">
              <div className="admin-stat-value">{val}</div>
              <div className="admin-stat-label">{key}</div>
            </div>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="gap-0 w-full relative rounded-none p-0 border-b border-[var(--border)] overflow-x-auto">
          {TABS.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="h-10 px-3 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-sm">
              <span>
                {t.label}
                {stats && stats[t.key] != null && <span className="admin-tab-count">{stats[t.key]}</span>}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="admin-loading">Loading...</div>
      ) : data.length === 0 ? (
        <div className="admin-empty">No data</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col}>{col}</th>
                ))}
                {tab === 'reports' && <th>actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.id || i}>
                  {columns.map(col => (
                    <td key={col}>
                      <CellValue field={col} value={row[col]} />
                    </td>
                  ))}
                  {tab === 'reports' && (
                    <td>
                      <ReportActions
                        report={row}
                        onResolved={(id) => setData(prev => prev.filter(r => r.id !== id))}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
