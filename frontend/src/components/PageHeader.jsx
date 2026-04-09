import { useNavigate } from 'react-router-dom'

export default function PageHeader({ title, subtitle, showBack = false, children }) {
  const navigate = useNavigate()

  return (
    <div className="page-header">
      <div className="page-header-title">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="page-header-back-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        {title && (
          <div className="page-header-title-text">
            <h2 className="page-header-heading">{title}</h2>
            {subtitle && <span className="page-header-subtitle">{subtitle}</span>}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
