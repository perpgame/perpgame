import { useRef, useEffect, useState, useCallback } from 'react'
import { Spinner } from '../ui/spinner'
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import { getCandleSnapshot } from '../../api/hyperliquid'
import { useHlWebSocket } from '../../hooks/useHlWebSocket'
import { CANDLE_INTERVALS, CANDLE_LOOKBACK, DEFAULT_INTERVAL } from '../../config/hyperliquid'

const INTERVAL_SECONDS = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
}

function parseCandle(c) {
  return {
    time: Math.floor(c.t / 1000),
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }
}

function fillGaps(candles, interval) {
  if (candles.length < 2) return candles
  const step = INTERVAL_SECONDS[interval] || 900
  const filled = [candles[0]]
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]
    let expected = prev.time + step
    while (expected < candles[i].time) {
      filled.push({
        time: expected,
        open: prev.close,
        high: prev.close,
        low: prev.close,
        close: prev.close,
        volume: 0,
      })
      expected += step
    }
    filled.push(candles[i])
  }
  return filled
}

export default function CandlestickChart({ coin, positions }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const priceLinesRef = useRef([])
  const [interval, setInterval_] = useState(DEFAULT_INTERVAL)
  const [loading, setLoading] = useState(true)

  // Fetch candle data
  useEffect(() => {
    if (!coin) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const endTime = Date.now()
        const startTime = endTime - (CANDLE_LOOKBACK[interval] || CANDLE_LOOKBACK['15m'])
        const candles = await getCandleSnapshot(coin, interval, startTime, endTime)
        if (cancelled) return

        const parsed = (candles || []).map(parseCandle).sort((a, b) => a.time - b.time)

        // Deduplicate by time
        const seen = new Set()
        const deduped = []
        for (const c of parsed) {
          if (!seen.has(c.time)) {
            seen.add(c.time)
            deduped.push(c)
          }
        }

        // Fill gaps with flat candles so chart has no blank areas
        const unique = fillGaps(deduped, interval)

        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(unique.map(c => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })))
        }
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(unique.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(181,239,220,0.3)' : 'rgba(246,70,93,0.3)',
          })))
        }
      } catch {
        // ignore
      }
      if (!cancelled) setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [coin, interval])

  // Create chart
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#71767b',
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(181,239,220,0.04)' },
        horzLines: { color: 'rgba(181,239,220,0.04)' },
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: 'rgba(181,239,220,0.2)',
          labelBackgroundColor: '#1a2332',
        },
        horzLine: {
          color: 'rgba(181,239,220,0.2)',
          labelBackgroundColor: '#1a2332',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(181,239,220,0.08)',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: 'rgba(181,239,220,0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#b5efdc',
      downColor: '#f6465d',
      borderUpColor: '#b5efdc',
      borderDownColor: '#f6465d',
      wickUpColor: '#b5efdc',
      wickDownColor: '#f6465d',
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.resize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        )
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [])

  // Draw entry price lines for open positions on this coin
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return

    // Remove old price lines
    priceLinesRef.current.forEach(pl => series.removePriceLine(pl))
    priceLinesRef.current = []

    if (!positions?.length) return

    const coinPositions = positions.filter(p => p.coin === coin)
    coinPositions.forEach(pos => {
      const isLong = pos.side === 'Long'
      const entryLine = series.createPriceLine({
        price: pos.entryPrice,
        color: isLong ? '#b5efdc' : '#f6465d',
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `${isLong ? 'Long' : 'Short'} Entry`,
      })
      priceLinesRef.current.push(entryLine)

      // Liquidation price line
      if (pos.liquidationPx) {
        const liqLine = series.createPriceLine({
          price: pos.liquidationPx,
          color: '#f6465d',
          lineWidth: 1,
          lineStyle: 1, // dotted
          axisLabelVisible: true,
          title: 'Liq',
        })
        priceLinesRef.current.push(liqLine)
      }
    })
  }, [positions, coin])

  // WS candle updates
  useHlWebSocket('candle', { coin, interval }, useCallback((data) => {
    if (!data || !candleSeriesRef.current) return
    const c = parseCandle(data)
    candleSeriesRef.current.update({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.update({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(181,239,220,0.3)' : 'rgba(246,70,93,0.3)',
      })
    }
  }, []))

  return (
    <div className="terminal-chart">
      <div className="terminal-chart-intervals">
        {CANDLE_INTERVALS.map(i => (
          <button
            key={i.value}
            className={`terminal-interval-btn ${interval === i.value ? 'active' : ''}`}
            onClick={() => setInterval_(i.value)}
          >
            {i.label}
          </button>
        ))}
      </div>
      <div className="terminal-chart-container" ref={containerRef}>
        {loading && (
          <div className="terminal-chart-loading">
            <Spinner size="sm" label="Loading chart..." />
          </div>
        )}
      </div>
    </div>
  )
}
