import { Card } from './card'

const BASE_GRID = 'grid items-center [&>span]:min-w-0 [&>span]:flex [&>span]:items-center [&>span]:justify-center'

/**
 * Reusable data grid — renders a header row + data rows with consistent styling.
 *
 * @param {string[]}  columns       - Column header labels
 * @param {string}    gridTemplate  - CSS grid-template-columns value (e.g. 'repeat(8, 1fr)')
 * @param {string}    minWidth      - Minimum width for horizontal scroll (e.g. '640px')
 * @param {boolean}   noCard        - Skip Card wrapper
 * @param {string}    className     - Extra className on the outer wrapper
 * @param {function}  renderRow     - (item, index, gridProps) => React element for each row
 * @param {Array}     data          - Array of data items
 * @param {React.ReactNode} empty   - Content to show when data is empty
 * @param {boolean}   extraCol      - Add an extra empty header column (for action buttons)
 */
export function DataGrid({ columns, gridTemplate, minWidth = '480px', noCard, className, renderRow, data, empty, extraCol }) {
  const template = gridTemplate || `repeat(${columns.length + (extraCol ? 1 : 0)}, 1fr)`
  const gridStyle = { gridTemplateColumns: template }
  const gridProps = { gridCols: BASE_GRID, gridStyle, minWidth }

  if (data?.length === 0 && empty) {
    return noCard ? empty : <Card className={className}>{empty}</Card>
  }

  const content = (
    <>
      <div
        style={{ color: 'white', minWidth, ...gridStyle }}
        className={`${BASE_GRID} py-2.5 text-xs font-medium text-[var(--text-third)] border-b border-[var(--separator)] divide-x divide-[var(--separator)]`}
      >
        {columns.map(col => (
          <span key={col} className="px-8">{col}</span>
        ))}
        {extraCol && <span></span>}
      </div>

      <div className="flex flex-col">
        {data?.map((item, i) => renderRow(item, i, gridProps))}
      </div>
    </>
  )

  if (noCard) return <div className={className}>{content}</div>
  return <Card className={className}>{content}</Card>
}

/** Standard row wrapper with hover/border styling */
export function DataGridRow({ children, gridCols, gridStyle, minWidth, className: extra, onClick }) {
  return (
    <div
      style={{ minWidth, ...gridStyle }}
      className={`${gridCols || BASE_GRID} py-2.5 border-b border-[var(--separator-subtle)] last:border-b-0 hover:bg-[var(--hover-tint)] transition-colors divide-x divide-[var(--separator-subtle)] ${extra || ''}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
