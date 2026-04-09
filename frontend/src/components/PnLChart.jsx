import { useMemo } from 'react'
import Chart from 'react-apexcharts'
import EmptyState from './EmptyState'

function prepareData(raw) {
  if (!raw?.length) return null

  const map = new Map()
  for (const d of raw) {
    let ts = d.ts
    if (!ts && d.date) {
      ts = new Date(d.date).getTime()
    }
    if (!ts || isNaN(ts)) continue
    map.set(Math.floor(ts / 1000), d.pnl ?? 0)
  }

  if (map.size < 2) return null

  const sorted = [...map.entries()].sort((a, b) => a[0] - b[0])

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][0] <= sorted[i - 1][0]) {
      sorted[i][0] = sorted[i - 1][0] + 1
    }
  }

  return sorted.map(([ts, pnl]) => ({ x: ts * 1000, y: pnl }))
}

function formatYAxis(val) {
  if (val == null || isNaN(val)) return '$0'
  const abs = Math.abs(val)
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(val / 1e3).toFixed(1)}k`
  return `$${Math.round(val)}`
}

function formatXLabel(val) {
  const d = new Date(val)
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const day = String(d.getDate()).padStart(2, '0')
  const year = String(d.getFullYear()).slice(2)
  return `${months[d.getMonth()]} ${day} '${year}`
}

export default function PnLChart({ data, title, height = 280 }) {
  const series = useMemo(() => {
    const prepared = prepareData(data)
    if (!prepared) return null
    return [{ name: 'PnL', data: prepared }]
  }, [data])

  if (!series || !data || data.length < 2) {
    return <EmptyState title="No trading data available" />
  }

  const lastVal = series[0].data[series[0].data.length - 1]?.y || 0
  const color = lastVal >= 0 ? '#b5efdc' : '#f6465d'

  const options = {
    chart: {
      type: 'area',
      fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: true },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 600,
      },
      sparkline: { enabled: false },
    },
    colors: [color],
    stroke: {
      curve: 'smooth',
      width: 3,
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        type: 'vertical',
        opacityFrom: 0.5,
        opacityTo: 0,
        stops: [0, 90, 100],
        colorStops: [
          { offset: 0, color, opacity: 0.5 },
          { offset: 90, color, opacity: 0 },
          { offset: 100, color, opacity: 0 },
        ],
      },
    },
    grid: {
      borderColor: '#2e2e2e',
      strokeDashArray: 5,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
      padding: { left: 10, right: 10 },
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { colors: '#ffffff', fontSize: '12px', fontWeight: 500 },
        rotate: 0,
        rotateAlways: false,
        formatter: formatXLabel,
      },
      axisBorder: { show: true, color: '#e0e0e0' },
      axisTicks: { show: true, color: '#e0e0e0' },
      crosshairs: {
        show: true,
        stroke: { color: '#b6b6b6', width: 1, dashArray: 3 },
      },
      tickAmount: 4,
    },
    yaxis: {
      labels: {
        style: { colors: '#909090', fontSize: '14px', fontWeight: 500 },
        formatter: formatYAxis,
        offsetX: -10,
      },
      tickAmount: 4,
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: {
      theme: 'dark',
      style: { fontSize: '13px' },
      x: {
        formatter: (val) => new Date(val).toLocaleDateString(),
      },
      y: {
        formatter: (val) => `$${val.toLocaleString()}`,
      },
      marker: { show: true },
      custom: ({ series: s, seriesIndex, dataPointIndex, w }) => {
        const val = s[seriesIndex][dataPointIndex]
        const ts = w.globals.seriesX[seriesIndex][dataPointIndex]
        const dateStr = new Date(ts).toLocaleDateString()
        const pnlColor = val >= 0 ? '#b5efdc' : '#f6465d'
        return `<div style="background:rgba(22,28,34,0.95);border:1px solid rgba(181,239,220,0.15);border-radius:12px;padding:8px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
          <div style="font-size:12px;color:#909090;margin-bottom:2px">${dateStr}</div>
          <div style="font-size:15px;font-weight:700;color:${pnlColor}">$${Math.abs(val).toLocaleString()}</div>
        </div>`
      },
    },
    markers: {
      size: 0,
      hover: { size: 6, sizeOffset: 2 },
      colors: [color],
      strokeColors: '#ffffff',
      strokeWidth: 2,
    },
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {title && <div style={{ fontSize: 15, fontWeight: 700, padding: '0 16px', marginBottom: 4 }}>{title}</div>}
      <Chart options={options} series={series} type="area" height={height} />
    </div>
  )
}
