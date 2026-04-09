import { useMemo } from 'react'
import Chart from 'react-apexcharts'
import EmptyState from './EmptyState'

function PredictionsChart({ outcomes, height }) {
  const series = useMemo(() => {
    if (!outcomes?.length) return null
    let correct = 0
    let wrong = 0
    const correctPts = []
    const wrongPts = []
    for (const o of outcomes) {
      if (o.outcome === 'correct') correct++
      else wrong++
      correctPts.push({ x: o.ts, y: correct })
      wrongPts.push({ x: o.ts, y: wrong })
    }
    if (correctPts.length < 2) return null
    return [
      { name: 'Correct', data: correctPts },
      { name: 'Wrong', data: wrongPts },
    ]
  }, [outcomes])

  if (!series) return <EmptyState title="Not enough data" />

  const options = {
    chart: {
      type: 'area',
      fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, easing: 'easeinout', speed: 600 },
    },
    colors: ['#b5efdc', '#f6465d'],
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        type: 'vertical',
        opacityFrom: 0.3,
        opacityTo: 0,
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
      },
      axisBorder: { show: true, color: '#e0e0e0' },
      axisTicks: { show: true, color: '#e0e0e0' },
      crosshairs: { show: true, stroke: { color: '#b6b6b6', width: 1, dashArray: 3 } },
      tickAmount: 4,
    },
    yaxis: {
      labels: {
        style: { colors: '#909090', fontSize: '13px', fontWeight: 500 },
        formatter: (v) => Math.round(v),
        offsetX: -10,
      },
      tickAmount: 4,
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: {
      theme: 'dark',
      style: { fontSize: '13px' },
      x: { formatter: (val) => new Date(val).toLocaleDateString() },
      custom: ({ series: s, dataPointIndex, w }) => {
        const correct = s[0][dataPointIndex]
        const wrong = s[1][dataPointIndex]
        const ts = w.globals.seriesX[0][dataPointIndex]
        const dateStr = new Date(ts).toLocaleDateString()
        return `<div style="background:rgba(22,28,34,0.95);border:1px solid rgba(181,239,220,0.15);border-radius:12px;padding:8px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
          <div style="font-size:12px;color:#909090;margin-bottom:4px">${dateStr}</div>
          <div style="font-size:13px;font-weight:600;color:#b5efdc">${correct} correct</div>
          <div style="font-size:13px;font-weight:600;color:#f6465d">${wrong} wrong</div>
        </div>`
      },
    },
    markers: {
      size: 0,
      hover: { size: 5, sizeOffset: 2 },
      strokeColors: '#ffffff',
      strokeWidth: 2,
    },
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <Chart options={options} series={series} type="area" height={height} />
    </div>
  )
}

function AccuracyLineChart({ outcomes, height }) {
  const series = useMemo(() => {
    if (!outcomes?.length) return null
    let correct = 0
    let total = 0
    const points = []
    for (const o of outcomes) {
      if (o.outcome === 'correct') correct++
      total++
      points.push({ x: o.ts, y: Math.round((correct / total) * 100) })
    }
    if (points.length < 2) return null
    return [{ name: 'Accuracy', data: points }]
  }, [outcomes])

  if (!series) return <EmptyState title="Not enough data" />

  const lastVal = series[0].data[series[0].data.length - 1]?.y ?? 0
  const color = lastVal >= 50 ? '#b5efdc' : '#f6465d'

  const options = {
    chart: {
      type: 'area',
      fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, easing: 'easeinout', speed: 600 },
      sparkline: { enabled: false },
    },
    colors: [color],
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        type: 'vertical',
        opacityFrom: 0.4,
        opacityTo: 0,
        colorStops: [
          { offset: 0, color, opacity: 0.4 },
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
      },
      axisBorder: { show: true, color: '#e0e0e0' },
      axisTicks: { show: true, color: '#e0e0e0' },
      crosshairs: { show: true, stroke: { color: '#b6b6b6', width: 1, dashArray: 3 } },
      tickAmount: 4,
    },
    yaxis: {
      min: 0,
      max: 100,
      labels: {
        style: { colors: '#909090', fontSize: '13px', fontWeight: 500 },
        formatter: (v) => `${v}%`,
        offsetX: -10,
      },
      tickAmount: 4,
    },
    annotations: {
      yaxis: [{
        y: 50,
        borderColor: 'rgba(255,255,255,0.15)',
        strokeDashArray: 4,
        label: {
          text: '50%',
          style: { color: 'rgba(255,255,255,0.3)', background: 'transparent', fontSize: '11px' },
          position: 'left',
          offsetX: 40,
        },
      }],
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: {
      theme: 'dark',
      style: { fontSize: '13px' },
      x: { formatter: (val) => new Date(val).toLocaleDateString() },
      y: { formatter: (val) => `${val}%` },
      marker: { show: true },
      custom: ({ series: s, seriesIndex, dataPointIndex, w }) => {
        const val = s[seriesIndex][dataPointIndex]
        const ts = w.globals.seriesX[seriesIndex][dataPointIndex]
        const dateStr = new Date(ts).toLocaleDateString()
        const c = val >= 50 ? '#b5efdc' : '#f6465d'
        return `<div style="background:rgba(22,28,34,0.95);border:1px solid rgba(181,239,220,0.15);border-radius:12px;padding:8px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
          <div style="font-size:12px;color:#909090;margin-bottom:2px">${dateStr}</div>
          <div style="font-size:15px;font-weight:700;color:${c}">${val}%</div>
        </div>`
      },
    },
    markers: {
      size: 0,
      hover: { size: 5, sizeOffset: 2 },
      colors: [color],
      strokeColors: '#ffffff',
      strokeWidth: 2,
    },
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <Chart options={options} series={series} type="area" height={height} />
    </div>
  )
}

export default function AccuracyChart({ outcomes, height = 200, mode = 'accuracy' }) {
  if (mode === 'predictions') return <PredictionsChart outcomes={outcomes} height={height} />
  return <AccuracyLineChart outcomes={outcomes} height={height} />
}
