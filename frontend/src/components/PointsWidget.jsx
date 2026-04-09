import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getPoints } from '../api/backend'

export default function PointsWidget({ user }) {
  const [points, setPoints] = useState({ total: 0 })

  useEffect(() => {
    getPoints().then(setPoints).catch(console.error)
  }, [])

  return (
    <div className="sidebar-box points-widget">
      <div className="points-widget-header">
        <span className="points-widget-season">Season 1</span>
      </div>
      <div className="points-widget-total">{points.total.toLocaleString()}</div>
      <div className="points-widget-label">Points</div>
      <Link to="/points" className="sidebar-box-show-more">View details</Link>
    </div>
  )
}
