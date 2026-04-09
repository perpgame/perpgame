export default function EmptyState({ title, subtitle }) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{title}</div>
      {subtitle && <div className="empty-state-subtitle">{subtitle}</div>}
    </div>
  )
}
