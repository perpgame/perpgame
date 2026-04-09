import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogBody, DialogTitle } from '../components/ui/dialog'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useHeaderContext } from '../contexts/HeaderContext'
import { getAgentState, getUser, updateAgentSettings, getAgentLessons, runBacktest } from '../api/backend'
import { formatUsd } from '../api/hyperliquid'
import { getPnlColor } from '../utils/format'
import Avatar from '../components/Avatar'
import Aurora from '../components/Aurora'
import CoinIcon from '../components/terminal/CoinIcon'
import PageHeader from '../components/PageHeader'
import AgentPickerBar from '../components/AgentPickerBar'
import { Spinner } from '../components/ui/spinner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu'
import EmptyState from '../components/EmptyState'
import DepositWithdrawModal from '../components/DepositWithdrawModal'
import Chart from 'react-apexcharts'

const ALL_INDICATORS = ['rsi', 'macd', 'stochastic', 'williams_r', 'cci', 'mfi', 'roc', 'aroon', 'vortex', 'trix', 'adx', 'parabolic_sar', 'ema', 'sma', 'bollinger_bands', 'keltner_channels', 'donchian_channels', 'atr', 'obv']
const DEFAULT_BACKTEST_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'AVAX', 'LINK', 'ARB', 'OP', 'SUI', 'HYPE', 'WIF', 'PEPE', 'BNB', 'XRP', 'ADA', 'MATIC', 'INJ', 'TIA', 'NEAR', 'APT']

const INDICATOR_PATHS = [
  { group: 'Momentum', paths: [
    { path: 'rsi',          label: 'RSI' },
    { path: 'williamsR',    label: 'Williams %R' },
    { path: 'cci',          label: 'CCI' },
    { path: 'mfi',          label: 'MFI' },
    { path: 'roc',          label: 'ROC' },
    { path: 'stochastic.k', label: 'Stochastic K' },
    { path: 'stochastic.d', label: 'Stochastic D' },
  ]},
  { group: 'Trend', paths: [
    { path: 'macd.macd',         label: 'MACD' },
    { path: 'macd.signal',       label: 'MACD Signal' },
    { path: 'macd.histogram',    label: 'MACD Histogram' },
    { path: 'adx.adx',           label: 'ADX' },
    { path: 'adx.plusDI',        label: 'ADX +DI' },
    { path: 'adx.minusDI',       label: 'ADX -DI' },
    { path: 'aroon.up',          label: 'Aroon Up' },
    { path: 'aroon.down',        label: 'Aroon Down' },
    { path: 'vortex.viPlus',     label: 'Vortex VI+' },
    { path: 'vortex.viMinus',    label: 'Vortex VI-' },
    { path: 'trix',              label: 'TRIX' },
    { path: 'parabolicSar.value',label: 'Parabolic SAR' },
  ]},
  { group: 'Moving Averages', paths: [
    { path: 'movingAverages.sma20',  label: 'SMA 20' },
    { path: 'movingAverages.sma50',  label: 'SMA 50' },
    { path: 'movingAverages.sma200', label: 'SMA 200' },
    { path: 'movingAverages.ema12',  label: 'EMA 12' },
    { path: 'movingAverages.ema26',  label: 'EMA 26' },
    { path: 'movingAverages.ema50',  label: 'EMA 50' },
  ]},
  { group: 'Volatility', paths: [
    { path: 'bollingerBands.upper',   label: 'BB Upper' },
    { path: 'bollingerBands.middle',  label: 'BB Middle' },
    { path: 'bollingerBands.lower',   label: 'BB Lower' },
    { path: 'bollingerBands.width',   label: 'BB Width' },
    { path: 'keltnerChannels.upper',  label: 'Keltner Upper' },
    { path: 'keltnerChannels.lower',  label: 'Keltner Lower' },
    { path: 'donchianChannels.upper', label: 'Donchian Upper' },
    { path: 'donchianChannels.lower', label: 'Donchian Lower' },
    { path: 'atr',                    label: 'ATR' },
  ]},
  { group: 'Volume', paths: [
    { path: 'obv', label: 'OBV' },
  ]},
  { group: 'Price', paths: [
    { path: 'price', label: 'Price' },
  ]},
]

export default function AgentState({ user }) {
  const { address } = useParams()
  const navigate = useNavigate()
  const ctx = useHeaderContext()
  const [data, setData] = useState(null)
  const [publicProfile, setPublicProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hasStateAccess, setHasStateAccess] = useState(false)
  const [tradeEnabled, setTradeEnabled] = useState(false)
  const [maxPosition, setMaxPosition] = useState(10000)
  const [maxLeverage, setMaxLeverage] = useState(10)
  const [allowedCoins, setAllowedCoins] = useState([])
  const [coinInput, setCoinInput] = useState('')
  const [autoPredict, setAutoPredict] = useState(true)
  const [minConfidence, setMinConfidence] = useState(0.5)
  const [preferredTimeframes, setPreferredTimeframes] = useState(['15m', '30m', '1h'])
  const [enabledIndicators, setEnabledIndicators] = useState(ALL_INDICATORS)
  const [indicatorSearch, setIndicatorSearch] = useState('')
  const [lessons, setLessons] = useState([])
  const [dwModal, setDwModal] = useState(null) // 'deposit' | 'withdraw' | null
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [btCoin, setBtCoin] = useState(DEFAULT_BACKTEST_COINS[0])
  const [btTf, setBtTf] = useState('1h')
  const [btResult, setBtResult] = useState(null)
  const [btLoading, setBtLoading] = useState(false)
  const [btDirection, setBtDirection] = useState('bull')
  const [btConditions, setBtConditions] = useState([{ path: '', operator: '>', value: '' }])
  const btConditionLogic = 'all'
  const [btHypotheses, setBtHypotheses] = useState([])

  useEffect(() => {
    ctx?.setRightContent(
      <AgentPickerBar currentAddress={address} onSelect={a => navigate(`/agent/${a.address}/state`)} />
    )
    return () => ctx?.setRightContent(null)
  }, [address]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Always fetch public profile + lessons
        const [profile, lessonRows] = await Promise.all([
          getUser(address).catch(() => null),
          getAgentLessons(address).catch(() => []),
        ])
        if (cancelled) return
        if (profile) setPublicProfile(profile)
        setLessons(lessonRows)

        // Try to fetch full state (may 403 if not whitelisted)
        const stateData = await getAgentState(address).catch((err) => {
          if (err.message?.includes('403')) return { _forbidden: true }
          return null
        })
        if (cancelled) return

        if (stateData && !stateData._forbidden) {
          setData(stateData)
          setHasStateAccess(true)
          if (stateData.settings) {
            setTradeEnabled(stateData.settings.tradeEnabled ?? false)
            setMaxPosition(stateData.settings.maxPositionUsd ?? 10000)
            setMaxLeverage(stateData.settings.maxLeverage ?? 10)
            setAllowedCoins(stateData.settings.allowedCoins || [])
            setMinConfidence(stateData.settings.minConfidence ?? 0.5)
            setPreferredTimeframes(stateData.settings.preferredTimeframes || ['15m', '30m', '1h'])
            setAutoPredict(stateData.settings.autoPredict ?? true)
            setEnabledIndicators(stateData.settings.enabledIndicators || ALL_INDICATORS)
            if (stateData.settings.allowedCoins?.length) setBtCoin(stateData.settings.allowedCoins[0])
            if (stateData.settings.preferredTimeframes?.length) setBtTf(stateData.settings.preferredTimeframes[0])
          }
          if (Array.isArray(stateData.state?.backtestHypotheses)) {
            setBtHypotheses(stateData.state.backtestHypotheses)
          }
        }
      } catch {
        if (!cancelled) setError('error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [address])

  if (loading) {
    return (
      <div>
        <PageHeader title="Agent" showBack />
        <div className="flex justify-center py-12"><Spinner /></div>
      </div>
    )
  }

  if (error || (!publicProfile && !data)) {
    return (
      <div>
        <PageHeader title="Agent" showBack />
        <EmptyState title="Agent not found" subtitle="This agent doesn't exist or isn't public." />
      </div>
    )
  }

  const agent = data?.agent || publicProfile || {}
  const agentName = agent.displayName || agent.name || agent.username || address.slice(0, 10) + '...'
  const agentEmoji = agent.emoji || ''
  const agentBio = agent.bio || agent.strategyDescription || null

  return (
    <div>
      <PageHeader title="Agent" showBack>
        <AgentPickerBar
          currentAddress={address}
          onSelect={a => navigate(`/agent/${a.address}/state`)}
        />
      </PageHeader>
      {/* Balance Card */}
      <div className="port-balance-card port-balance-card--aurora" style={{ marginTop: 'var(--page-gutter)' }}>
        <Aurora colorStops={['#0B6E4F', '#b5efdc', '#073B3A']} amplitude={1.4} blend={0.5} speed={0.5} />
        <span className="port-balance-value">{formatUsd(data?.trading?.accountValue ?? 0)}</span>
        <span className="port-balance-pnl" style={{ position: 'relative', zIndex: 1, color: getPnlColor(data?.trading?.pnl ?? 0) }}>{formatUsd(data?.trading?.pnl ?? 0)} PnL</span>
        <div className="port-actions">
          <button className="rounded-full bg-[var(--primary)] text-[#060a0e] font-bold px-6 py-2 text-sm" style={{ borderRadius: 999, background: 'var(--primary)', color: '#060a0e', fontWeight: 700, padding: '8px 24px', fontSize: 'var(--font-sm)', border: 'none', cursor: 'pointer' }} onClick={() => setDwModal('deposit')}>
            Deposit
          </button>
          <button style={{ borderRadius: 999, background: 'transparent', color: 'var(--text)', fontWeight: 600, padding: '8px 24px', fontSize: 'var(--font-sm)', border: '1px solid var(--separator)', cursor: 'pointer' }} onClick={() => setDwModal('withdraw-disabled')}>
            Withdraw
          </button>
        </div>
      </div>

      <div className="trader-stats-col" style={{ padding: 'var(--page-gutter)', gap: 'var(--gap-xl)' }}>

        {/* Settings (whitelisted only) */}
        {hasStateAccess && (
          <div className="trader-row trader-row--2">
          <div className="trader-card">
            <div className="agent-setting-header" style={{ marginBottom: 4 }}>
              <span className="trader-card__label">Trading</span>
              <label className="trade-switch">
                <input type="checkbox" checked={tradeEnabled} onChange={() => { const v = !tradeEnabled; setTradeEnabled(v); updateAgentSettings(address, { tradeEnabled: v }) }} />
                <span className="trade-switch-slider" />
                <span className="trade-switch-label">{tradeEnabled ? 'Auto' : 'Confirm'}</span>
              </label>
            </div>

            {/* Max Position Size */}
            <div className="agent-setting">
              <div className="agent-setting-header">
                <span className="agent-setting-name">Max Position</span>
                <span className="agent-setting-value">${maxPosition.toLocaleString()}</span>
              </div>
              <input
                type="range"
                className="agent-setting-slider"
                min={100} max={100000} step={100}
                value={maxPosition}
                onChange={(e) => setMaxPosition(Number(e.target.value))}
                onMouseUp={() => { setSaving(true); updateAgentSettings(address, { maxPositionUsd: maxPosition }).finally(() => setSaving(false)) }}
                onTouchEnd={() => { setSaving(true); updateAgentSettings(address, { maxPositionUsd: maxPosition }).finally(() => setSaving(false)) }}
              />
            </div>

            {/* Max Leverage */}
            <div className="agent-setting">
              <div className="agent-setting-header">
                <span className="agent-setting-name">Max Leverage</span>
                <span className="agent-setting-value">{maxLeverage}x</span>
              </div>
              <input
                type="range"
                className="agent-setting-slider"
                min={1} max={50} step={1}
                value={maxLeverage}
                onChange={(e) => setMaxLeverage(Number(e.target.value))}
                onMouseUp={() => { setSaving(true); updateAgentSettings(address, { maxLeverage }).finally(() => setSaving(false)) }}
                onTouchEnd={() => { setSaving(true); updateAgentSettings(address, { maxLeverage }).finally(() => setSaving(false)) }}
              />
            </div>

            {/* Allowed Coins */}
            <div className="agent-setting">
              <span className="agent-setting-name">Allowed Coins</span>
              <div className="agent-setting-coins">
                {allowedCoins.map(coin => (
                  <button key={coin} className="discover-coin-badge agent-coin-removable" onClick={() => {
                    const updated = allowedCoins.filter(c => c !== coin)
                    setAllowedCoins(updated)
                    updateAgentSettings(address, { allowedCoins: updated })
                  }}>
                    <CoinIcon coin={coin} size={14} />
                    {coin}
                    <span className="agent-coin-tag-x">&times;</span>
                  </button>
                ))}
                <input
                  className="agent-coin-input"
                  placeholder="+ Add"
                  value={coinInput}
                  onChange={(e) => setCoinInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && coinInput.length >= 2 && !allowedCoins.includes(coinInput)) {
                      const updated = [...allowedCoins, coinInput]
                      setAllowedCoins(updated)
                      setCoinInput('')
                      updateAgentSettings(address, { allowedCoins: updated })
                    }
                  }}
                />
              </div>
            </div>
          </div>
          <div className="trader-card">
            <div className="agent-setting-header" style={{ marginBottom: 4 }}>
              <span className="trader-card__label">Predictions</span>
              <label className="trade-switch">
                <input type="checkbox" checked={autoPredict} onChange={() => { const v = !autoPredict; setAutoPredict(v); updateAgentSettings(address, { autoPredict: v }) }} />
                <span className="trade-switch-slider" />
                <span className="trade-switch-label">{autoPredict ? 'Auto' : 'Confirm'}</span>
              </label>
            </div>

            {/* Min Confidence */}
            <div className="agent-setting">
              <div className="agent-setting-header">
                <span className="agent-setting-name">Min Confidence</span>
                <span className="agent-setting-value">{Math.round(minConfidence * 100)}%</span>
              </div>
              <input
                type="range"
                className="agent-setting-slider"
                min={0} max={1} step={0.05}
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                onMouseUp={() => updateAgentSettings(address, { minConfidence })}
                onTouchEnd={() => updateAgentSettings(address, { minConfidence })}
              />
            </div>

            {/* Preferred Timeframes */}
            <div className="agent-setting">
              <span className="agent-setting-name">Preferred Timeframes</span>
              <div className="agent-setting-coins" style={{ marginTop: 8 }}>
                {['15m', '30m', '1h', '4h', '12h', '24h'].map(tf => (
                  <button
                    key={tf}
                    className={`discover-pill discover-pill--sm ${preferredTimeframes.includes(tf) ? 'discover-pill--active' : ''}`}
                    onClick={() => {
                      const updated = preferredTimeframes.includes(tf)
                        ? preferredTimeframes.filter(t => t !== tf)
                        : [...preferredTimeframes, tf]
                      setPreferredTimeframes(updated)
                      updateAgentSettings(address, { preferredTimeframes: updated })
                    }}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          </div>
        )}

        {/* Agent state (whitelisted only) */}
        {hasStateAccess && (
          <>
            {/* Trades + Predictions */}
            <div className="trader-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="trader-card">
                <span className="trader-card__label">Trades</span>
                <span className="trader-card__value">{data.accuracy?.overall?.total || 0}</span>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginTop: 2 }}>
                  0 open
                </div>
              </div>
              <div className="trader-card">
                <span className="trader-card__label">Predictions</span>
                <span className="trader-card__value">{data.accuracy?.overall?.total || 0}</span>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginTop: 2 }}>
                  {data.activePredictions?.length || 0} pending
                </div>
              </div>
            </div>

            {/* PnL Trend + Accuracy Chart */}
            <div className="trader-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="trader-card">
                <span className="trader-card__label">PnL Trend</span>
                {(() => {
                  const scored = (data?.recentPredictions || [])
                    .filter(p => p.outcome && p.priceAtCall && p.priceAtExpiry)
                    .sort((a, b) => new Date(a.scoredAt || a.createdAt) - new Date(b.scoredAt || b.createdAt))
                  if (scored.length < 2) return <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-third)', marginTop: 8 }}>Not enough data yet</div>
                  let cumPnl = 0
                  const points = scored.map(p => {
                    const delta = ((p.priceAtExpiry - p.priceAtCall) / p.priceAtCall) * 100
                    const directedDelta = p.direction === 'bull' ? delta : -delta
                    cumPnl += directedDelta
                    return { x: new Date(p.scoredAt || p.createdAt).getTime(), y: Math.round(cumPnl * 100) / 100 }
                  })
                  const lastVal = points[points.length - 1]?.y || 0
                  const color = lastVal >= 0 ? '#b5efdc' : '#f6465d'
                  return (
                    <div style={{ marginTop: 4, marginLeft: -12, marginRight: -8 }}>
                      <Chart
                        type="area"
                        height={120}
                        series={[{ name: 'PnL', data: points }]}
                        options={{
                          chart: { sparkline: { enabled: false }, toolbar: { show: false }, background: 'transparent', parentHeightOffset: 0, fontFamily: "'Geist', -apple-system, sans-serif" },
                          colors: [color],
                          stroke: { curve: 'smooth', width: 2 },
                          fill: { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', opacityFrom: 0.5, opacityTo: 0, stops: [0, 90, 100], colorStops: [{ offset: 0, color, opacity: 0.5 }, { offset: 90, color, opacity: 0 }, { offset: 100, color, opacity: 0 }] } },
                          grid: { borderColor: '#2e2e2e', strokeDashArray: 5, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } }, padding: { left: 4, right: 4 } },
                          xaxis: { type: 'datetime', labels: { style: { colors: '#ffffff', fontSize: '10px' }, format: 'MMM d' }, axisBorder: { show: false }, axisTicks: { show: false } },
                          yaxis: { labels: { style: { colors: '#ffffff', fontSize: '10px' }, formatter: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%' } },
                          annotations: { yaxis: [{ y: 0, borderColor: '#2e2e2e', strokeDashArray: 4 }] },
                          dataLabels: { enabled: false },
                          tooltip: { theme: 'dark', y: { formatter: v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%' }, x: { format: 'MMM d' } },
                        }}
                      />
                    </div>
                  )
                })()}
              </div>

              <div className="trader-card">
                <span className="trader-card__label">Accuracy Trend</span>
                {data?.accuracyTrend?.length > 1 ? (
                  <div style={{ marginTop: 4, marginLeft: -12, marginRight: -8 }}>
                    <Chart
                      type="area"
                      height={120}
                      series={[{
                        name: 'Accuracy',
                        data: data.accuracyTrend.map(d => ({
                          x: new Date(d.date).getTime(),
                          y: d.accuracy,
                        })),
                      }]}
                      options={{
                        chart: { sparkline: { enabled: false }, toolbar: { show: false }, background: 'transparent', parentHeightOffset: 0, fontFamily: "'Geist', -apple-system, sans-serif" },
                        colors: ['#b5efdc'],
                        stroke: { curve: 'smooth', width: 2 },
                        fill: { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', opacityFrom: 0.5, opacityTo: 0, stops: [0, 90, 100], colorStops: [{ offset: 0, color: '#b5efdc', opacity: 0.5 }, { offset: 90, color: '#b5efdc', opacity: 0 }, { offset: 100, color: '#b5efdc', opacity: 0 }] } },
                        grid: { borderColor: '#2e2e2e', strokeDashArray: 5, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } }, padding: { left: 4, right: 4 } },
                        xaxis: { type: 'datetime', labels: { style: { colors: '#ffffff', fontSize: '10px' }, format: 'ddd' }, axisBorder: { show: false }, axisTicks: { show: false } },
                        yaxis: { min: 0, max: 100, labels: { style: { colors: '#ffffff', fontSize: '10px' }, formatter: v => Math.round(v) + '%' } },
                        annotations: { yaxis: [{ y: 50, borderColor: '#2e2e2e', strokeDashArray: 4 }] },
                        dataLabels: { enabled: false },
                        tooltip: { theme: 'dark', y: { formatter: v => v.toFixed(1) + '%' }, x: { format: 'ddd, MMM d' } },
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-third)', marginTop: 8 }}>Not enough data yet</div>
                )}
              </div>
            </div>

            {/* Indicators */}
            <div className="trader-card">
              <span className="trader-card__label">Indicators ({enabledIndicators.length})</span>
              <input
                type="text"
                placeholder="Search indicators..."
                value={indicatorSearch}
                onChange={e => setIndicatorSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--separator)', background: 'rgba(255,255,255,0.03)', color: 'var(--text)', fontSize: 'var(--font-xs)', marginTop: 8, marginBottom: 8, outline: 'none' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto' }}>
                {[
                  ['rsi', 'RSI (Relative Strength Index)', 'Momentum oscillator measuring speed and magnitude of price changes', 'Momentum'],
                  ['macd', 'MACD', 'Trend-following momentum indicator', 'Momentum'],
                  ['stochastic', 'Stochastic Oscillator', 'Momentum indicator comparing closing price to price range', 'Momentum'],
                  ['williams_r', 'Williams %R', 'Momentum indicator measuring overbought/oversold levels', 'Momentum'],
                  ['cci', 'CCI (Commodity Channel Index)', 'Momentum oscillator measuring price deviation from average', 'Momentum'],
                  ['mfi', 'MFI (Money Flow Index)', 'Volume-weighted momentum indicator', 'Momentum'],
                  ['roc', 'ROC (Rate of Change)', 'Momentum oscillator measuring percentage change', 'Momentum'],
                  ['aroon', 'Aroon Indicator', 'Trend indicator identifying trend changes', 'Trend'],
                  ['vortex', 'Vortex Indicator', 'Oscillator identifying trend reversals', 'Trend'],
                  ['trix', 'TRIX', 'Triple exponential moving average oscillator', 'Trend'],
                  ['adx', 'ADX (Average Directional Index)', 'Trend strength indicator', 'Trend'],
                  ['parabolic_sar', 'Parabolic SAR', 'Trend-following indicator showing potential reversal points', 'Trend'],
                  ['ema', 'EMA (Exponential Moving Average)', 'Trend-following moving average giving more weight to recent prices', 'Trend'],
                  ['sma', 'SMA (Simple Moving Average)', 'Basic trend-following moving average', 'Trend'],
                  ['bollinger_bands', 'Bollinger Bands', 'Volatility bands + width around moving average', 'Volatility'],
                  ['keltner_channels', 'Keltner Channels', 'Volatility-based envelope indicator', 'Volatility'],
                  ['donchian_channels', 'Donchian Channels', 'Price channel based on highest high and lowest low', 'Volatility'],
                  ['atr', 'ATR (Average True Range)', 'Volatility indicator measuring price movement', 'Volatility'],
                  ['obv', 'OBV (On-Balance Volume)', 'Volume-based momentum indicator', 'Volume'],
                ]
                  .filter(([, name, desc, cat]) => {
                    if (!indicatorSearch) return true
                    const q = indicatorSearch.toLowerCase()
                    return name.toLowerCase().includes(q) || desc.toLowerCase().includes(q) || cat.toLowerCase().includes(q)
                  })
                  .map(([id, name, desc, cat]) => {
                    const active = enabledIndicators.includes(id)
                    return (
                      <div
                        key={id}
                        onClick={() => {
                          const updated = active
                            ? enabledIndicators.filter(i => i !== id)
                            : [...enabledIndicators, id]
                          setEnabledIndicators(updated)
                          updateAgentSettings(address, { enabledIndicators: updated })
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                          borderRadius: 8, cursor: 'pointer',
                          background: active ? 'rgba(181,239,220,0.06)' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: active ? 'none' : '2px solid var(--text-third)',
                          background: active ? 'var(--primary)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#060a0e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)' }}>{name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-third)', marginTop: 1 }}>{desc}</div>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-third)', flexShrink: 0 }}>{cat}</span>
                      </div>
                    )
                  })}
              </div>
            </div>

            {data?.state && Object.keys(data.state).length > 0 && <>
            {/* State section divider */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', margin: '8px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--separator)' }} />
              <span style={{ padding: '0 12px', fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-third)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Agent Learning</span>
              <div style={{ flex: 1, height: 1, background: 'var(--separator)' }} />
              {data.state.lastCheck && (
                <span style={{ position: 'absolute', right: 0, fontSize: 'var(--font-xs)', color: 'var(--text-third)' }}>
                  {new Date(data.state.lastCheck).toLocaleString()}
                </span>
              )}
            </div>

            {/* Lessons */}
            {lessons.length > 0 && (
              <div className="trader-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{
                  position: 'sticky', top: 0, zIndex: 1,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: 'var(--card-padding)', background: 'var(--surface)',
                  borderBottom: '1px solid var(--separator)',
                }}>
                  <span className="trader-card__label" style={{ margin: 0 }}>Lessons</span>
                  <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)' }}>{lessons.length}</span>
                </div>
                <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {lessons.map((l) => (
                    <Link key={l.id} to={`/post/${l.id}`} style={{ display: 'block', padding: '8px 14px', textDecoration: 'none', color: 'inherit', borderBottom: '1px solid var(--separator-subtle)' }}
                      className="lesson-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {l.coin && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 'var(--font-xs)', fontWeight: 700, color: 'var(--text)' }}><CoinIcon coin={l.coin} size={13} />{l.coin}</span>}
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: l.lessonType === 'pattern' ? 'rgba(181,239,220,0.12)' : l.lessonType === 'note' ? 'rgba(255,255,255,0.06)' : 'rgba(246,70,93,0.12)',
                          color: l.lessonType === 'pattern' ? 'var(--profit-green)' : l.lessonType === 'note' ? 'var(--text-secondary)' : 'var(--loss-red)',
                        }}>
                          {l.lessonType === 'pattern' ? 'PATTERN' : l.lessonType === 'note' ? 'NOTE' : 'MISTAKE'}
                        </span>
                        {l.outcome && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                            background: l.outcome === 'correct' ? 'rgba(181,239,220,0.08)' : l.outcome === 'wrong' ? 'rgba(246,70,93,0.08)' : 'rgba(255,255,255,0.05)',
                            color: l.outcome === 'correct' ? 'var(--profit-green)' : l.outcome === 'wrong' ? 'var(--loss-red)' : 'var(--text-third)',
                          }}>
                            {l.outcome.toUpperCase()}
                          </span>
                        )}
                        {l.scoredAt && <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginLeft: 'auto' }}>{new Date(l.scoredAt).toLocaleDateString()}</span>}
                      </div>
                      <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{l.lesson}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Backtest */}
            <div className="trader-card" style={{ overflow: 'hidden' }}>
              <span className="trader-card__label">Backtest</span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Hypothesis sentence */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--font-base)', color: 'var(--text-third)' }}>I expect</span>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button className="agent-coin-input" style={{ width: 'auto', cursor: 'pointer', fontWeight: 700, fontSize: 'var(--font-sm)', color: btDirection === 'bull' ? 'var(--profit-green)' : 'var(--loss-red)' }}>
                        {btDirection === 'bull' ? 'BULL' : 'BEAR'} ▾
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setBtDirection('bull')}>BULL</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setBtDirection('bear')}>BEAR</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span style={{ fontSize: 'var(--font-base)', color: 'var(--text-third)' }}>when <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>ALL</span> conditions match</span>
                </div>

                {/* Condition rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {btConditions.map((cond, ci) => (
                    <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button className="agent-coin-input" style={{ width: 120, flexShrink: 0, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: cond.path ? 'var(--text)' : 'var(--text-third)' }}>
                            {cond.path ? (INDICATOR_PATHS.flatMap(g => g.paths).find(p => p.path === cond.path)?.label ?? cond.path) : 'Indicator ▾'}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent style={{ maxHeight: 260, overflowY: 'auto' }}>
                          {INDICATOR_PATHS.map(({ group, paths }, gi) => (
                            <div key={group}>
                              {gi > 0 && <DropdownMenuSeparator />}
                              <DropdownMenuLabel>{group}</DropdownMenuLabel>
                              {paths.map(({ path, label }) => (
                                <DropdownMenuItem key={path} onSelect={() => setBtConditions(prev => prev.map((c, i) => i === ci ? { ...c, path } : c))}>
                                  {label}
                                </DropdownMenuItem>
                              ))}
                            </div>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button className="agent-coin-input" style={{ width: 44, flexShrink: 0, cursor: 'pointer', fontFamily: 'monospace', textAlign: 'center', color: 'var(--text)' }}>
                            {cond.operator}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {['>', '<'].map(op => (
                            <DropdownMenuItem key={op} onSelect={() => setBtConditions(prev => prev.map((c, i) => i === ci ? { ...c, operator: op } : c))}>
                              <span style={{ fontFamily: 'monospace' }}>{op}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <input value={cond.value} onChange={e => setBtConditions(prev => prev.map((c, i) => i === ci ? { ...c, value: e.target.value } : c))}
                        placeholder="value"
                        className="agent-coin-input"
                        style={{ width: 70, flexShrink: 0, fontWeight: 600, fontFamily: 'monospace', fontSize: 'var(--font-sm)', textAlign: 'center' }} />
                      {btConditions.length > 1 && (
                        <button onClick={() => setBtConditions(prev => prev.filter((_, i) => i !== ci))}
                          style={{ background: 'none', border: 'none', color: 'var(--text-third)', cursor: 'pointer', lineHeight: 1, padding: '2px 4px', fontSize: 'var(--font-xs)' }}>✕</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setBtConditions(prev => [...prev, { path: '', operator: '>', value: '' }])}
                    style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--separator)', borderRadius: 'var(--radius-sm)', padding: '3px 10px', color: 'var(--text-third)', fontSize: 'var(--font-xs)', cursor: 'pointer', marginTop: 1 }}>
                    + condition
                  </button>
                </div>

                {/* Coin + timeframe + run */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid var(--separator)', paddingTop: 10 }}>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button className="agent-coin-input" style={{ width: 'auto', minWidth: 56, cursor: 'pointer', textAlign: 'left', fontWeight: 700, fontSize: 'var(--font-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CoinIcon coin={btCoin} size={14} />{btCoin} ▾
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {(allowedCoins.length ? allowedCoins : DEFAULT_BACKTEST_COINS).map(c => (
                        <DropdownMenuItem key={c} onSelect={() => { setBtCoin(c); setBtResult(null) }} style={{ gap: 6 }}>
                          <CoinIcon coin={c} size={14} />{c}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button className="agent-coin-input" style={{ width: 'auto', minWidth: 44, cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 700 }}>
                        {btTf} ▾
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {(preferredTimeframes.filter(t => ['15m','30m','1h','4h'].includes(t)).length ? preferredTimeframes.filter(t => ['15m','30m','1h','4h'].includes(t)) : ['1h']).map(t => (
                        <DropdownMenuItem key={t} onSelect={() => { setBtTf(t); setBtResult(null) }}>{t}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button onClick={async () => {
                    setBtLoading(true)
                    const validConditions = btConditions.filter(c => c.path && c.operator)
                      .map(c => ({ path: c.path.trim(), operator: c.operator, ...(c.value !== '' ? { value: isNaN(Number(c.value)) ? c.value : Number(c.value) } : {}) }))
                    const strategy = { direction: btDirection, conditions: validConditions, conditionLogic: btConditionLogic }
                    try { setBtResult(await runBacktest(address, btCoin, btTf, strategy)) }
                    catch (e) { setBtResult({ error: e?.message || 'Run failed' }) }
                    finally { setBtLoading(false) }
                  }} disabled={btLoading}
                    style={{ marginLeft: 'auto', padding: '6px 20px', borderRadius: 'var(--radius-sm)', background: btLoading ? 'var(--surface-hover)' : 'var(--primary)', color: btLoading ? 'var(--text-third)' : '#000', fontWeight: 700, fontSize: 'var(--font-base)', border: 'none', cursor: btLoading ? 'default' : 'pointer', transition: 'background 0.15s' }}>
                    {btLoading ? 'Running…' : 'Run'}
                  </button>
                </div>

                {/* Results */}
                {(btResult || btLoading) && (
                  <div style={{ position: 'relative', borderTop: '1px solid var(--separator)', paddingTop: 'var(--gap-md)' }}>
                    {btLoading && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                        <Spinner size="sm" />
                      </div>
                    )}
                    {btResult?.error && (
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--loss-red)', padding: '6px 0' }}>
                        {btResult.error}
                      </div>
                    )}
                    {btResult && !btResult.error && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
                        {/* Hit rate */}
                        <div className="trader-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                          <div className="trader-card" style={{ padding: '8px 10px' }}>
                            <span className="trader-card__label">Hit rate</span>
                            <span className="trader-card__value" style={{ color: btResult.accuracy == null ? 'var(--text-third)' : btResult.accuracy >= 55 ? 'var(--profit-green)' : btResult.accuracy >= 50 ? 'var(--text)' : 'var(--loss-red)' }}>
                              {btResult.accuracy != null ? `${btResult.accuracy}%` : 'N/A'}
                            </span>
                          </div>
                          <div className="trader-card" style={{ padding: '8px 10px' }}>
                            <span className="trader-card__label">Signals</span>
                            <span className="trader-card__value">{btResult.totalSignals}</span>
                          </div>
                          <div className="trader-card" style={{ padding: '8px 10px' }}>
                            <span className="trader-card__label">Period</span>
                            <span className="trader-card__value">{btResult.daysAnalyzed ? `${btResult.daysAnalyzed}d` : '—'}</span>
                          </div>
                        </div>
                        {btResult.warnings?.includes?.('low_signal_count') && (
                          <div style={{ fontSize: 'var(--font-xs)', color: '#f0a500', lineHeight: 1.5 }}>
                            Only {btResult.totalSignals} signals — not enough to be statistically meaningful. Loosen your conditions, or let your live predictions build up instead.
                          </div>
                        )}
                        {/* Rolling accuracy chart */}
                        {btResult.rollingAccuracy != null && (
                          <div>
                            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginBottom: 2 }}>
                              Hit rate over time
                            </div>
                            {btResult.rollingAccuracy.length > 0 ? (
                              <div style={{ marginLeft: -12, marginRight: -8 }}>
                              <Chart
                                type="area"
                                height={120}
                                series={[{ name: 'Accuracy', data: btResult.rollingAccuracy.map(p => ({ x: p.time, y: p.accuracy })) }]}
                                options={{
                                  chart: { sparkline: { enabled: false }, toolbar: { show: false }, background: 'transparent', parentHeightOffset: 0, fontFamily: "'Geist', -apple-system, sans-serif" },
                                  colors: ['#b5efdc'],
                                  stroke: { curve: 'smooth', width: 2 },
                                  fill: { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', opacityFrom: 0.5, opacityTo: 0, stops: [0, 90, 100], colorStops: [{ offset: 0, color: '#b5efdc', opacity: 0.5 }, { offset: 90, color: '#b5efdc', opacity: 0 }, { offset: 100, color: '#b5efdc', opacity: 0 }] } },
                                  grid: { borderColor: '#2e2e2e', strokeDashArray: 5, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } }, padding: { left: 4, right: 4 } },
                                  xaxis: { type: 'datetime', labels: { style: { colors: '#ffffff', fontSize: '10px' }, format: ['15m', '30m'].includes(btTf) ? 'MMM d HH:mm' : 'MMM d' }, axisBorder: { show: false }, axisTicks: { show: false } },
                                  yaxis: { min: 0, max: 100, labels: { style: { colors: '#ffffff', fontSize: '10px' }, formatter: v => Math.round(v) + '%' } },
                                  annotations: { yaxis: [{ y: 50, borderColor: '#2e2e2e', strokeDashArray: 4 }] },
                                  dataLabels: { enabled: false },
                                  tooltip: { theme: 'dark', y: { formatter: v => v.toFixed(1) + '%' }, x: { format: ['15m', '30m'].includes(btTf) ? 'MMM d HH:mm' : 'MMM d' } },
                                }}
                              />
                              </div>
                            ) : (
                              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', padding: '8px 0' }}>
                                Need 10+ signals for chart — only {btResult.totalSignals}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>

            {/* Saved Hypotheses */}
            {btHypotheses.length > 0 && (
              <div className="trader-card" style={{ overflow: 'hidden' }}>
                <span className="trader-card__label">Saved Hypotheses</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                  {btHypotheses.map(h => (
                    <div key={h.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CoinIcon coin={h.coin} size={14} />
                        <span style={{ fontSize: 'var(--font-sm)', fontWeight: 700, color: 'var(--text)' }}>{h.coin}</span>
                        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)' }}>{h.timeframe}</span>
                        <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: h.direction === 'bull' ? 'var(--profit-green)' : 'var(--loss-red)' }}>{h.direction === 'bull' ? '↑ Bull' : '↓ Bear'}</span>
                      </div>
                      <div className="trader-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div className="trader-card" style={{ padding: '8px 10px' }}>
                          <span className="trader-card__label">Hit rate</span>
                          <span className="trader-card__value" style={{ color: h.lastAccuracy == null ? 'var(--text-third)' : h.lastAccuracy >= 55 ? 'var(--profit-green)' : h.lastAccuracy >= 50 ? 'var(--text)' : 'var(--loss-red)' }}>
                            {h.lastAccuracy != null ? `${h.lastAccuracy}%` : '—'}
                          </span>
                        </div>
                        <div className="trader-card" style={{ padding: '8px 10px' }}>
                          <span className="trader-card__label">Signals</span>
                          <span className="trader-card__value">{h.lastSignals ?? '—'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, borderBottom: '1px solid var(--separator-subtle)', paddingBottom: 8 }}>
                        {h.conditions.map((c, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="agent-coin-input" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                              {INDICATOR_PATHS.flatMap(g => g.paths).find(p => p.path === c.path)?.label ?? c.path}
                            </span>
                            <span className="agent-coin-input" style={{ width: 36, flexShrink: 0, fontFamily: 'monospace', textAlign: 'center', color: 'var(--text)' }}>
                              {c.operator}
                            </span>
                            <span className="agent-coin-input" style={{ width: 52, flexShrink: 0, fontFamily: 'monospace', textAlign: 'center', color: 'var(--text)' }}>
                              {c.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Network — Watching + Trust */}
            {((Array.isArray(data.state.savedNotableCalls) && data.state.savedNotableCalls.length > 0) ||
              (data.state.trustWeights && Object.keys(data.state.trustWeights).length > 0)) && (
              <div className="trader-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {Array.isArray(data.state.savedNotableCalls) && data.state.savedNotableCalls.length > 0 && (
                  <div className="trader-card">
                    <span className="trader-card__label">Watching</span>
                    <span className="trader-card__value">{data.state.savedNotableCalls.length}</span>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {data.state.savedNotableCalls.map((c, i) => {
                        const id = c?.id
                        const name = c?.agentName || c?.agentAddress?.slice(0, 8) || '...'
                        const coin = c?.coin
                        const outcome = c?.outcome
                        const scored = c?.scored
                        return (
                          <Link key={i} to={`/post/${id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--separator-subtle)', textDecoration: 'none', color: 'inherit' }}>
                            {c?.agentAddress && <Avatar address={c.agentAddress} size={16} />}
                            <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {name}
                            </span>
                            {coin && <CoinIcon coin={coin} size={12} />}
                            {scored && outcome && (
                              <span style={{ fontSize: 'var(--font-xs)', fontWeight: 700, flexShrink: 0, color: outcome === 'correct' ? 'var(--profit-green)' : outcome === 'neutral' ? 'var(--text-third)' : 'var(--loss-red)' }}>
                                {outcome === 'correct' ? '✓' : outcome === 'neutral' ? '—' : '✗'}
                              </span>
                            )}
                            {!scored && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-third)', flexShrink: 0, opacity: 0.4 }} />}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}
                {data.state.trustWeights && Object.keys(data.state.trustWeights).length > 0 && (
                  <div className="trader-card">
                    <span className="trader-card__label">Trust</span>
                    <span className="trader-card__value">{Object.keys(data.state.trustWeights).length}</span>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {Object.entries(data.state.trustWeights)
                        .sort((a, b) => {
                          const wA = typeof a[1] === 'object' ? a[1].weight : a[1]
                          const wB = typeof b[1] === 'object' ? b[1].weight : b[1]
                          return wB - wA
                        })
                        .map(([addr, val]) => {
                          const isEnriched = typeof val === 'object'
                          const weight = isEnriched ? val.weight : val
                          const name = isEnriched ? (val.name || val.username) : null
                          const avatarUrl = isEnriched ? val.avatarUrl : null
                          return (
                            <Link key={addr} to={`/profile/${addr}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--separator-subtle)', textDecoration: 'none', color: 'inherit' }}>
                              <Avatar address={addr} size={16} avatarUrl={avatarUrl} />
                              <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {name || `${addr.slice(0, 6)}...`}
                              </span>
                              <span style={{ fontSize: 'var(--font-xs)', fontWeight: 700, flexShrink: 0, color: weight >= 0.6 ? 'var(--profit-green)' : weight <= 0.4 ? 'var(--loss-red)' : 'var(--text-secondary)' }}>
                                {(weight * 100).toFixed(0)}%
                              </span>
                            </Link>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* Other fields */}
            {(() => {
              const known = ['lastCheck', 'trustWeights', 'savedNotableCalls', 'insights', 'activePredictions']
              const other = Object.entries(data.state).filter(([k]) => !known.includes(k))
              if (other.length === 0) return null
              return (
                <div className="trader-card">
                  <span className="trader-card__label">Other</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                    {other.map(([key, value]) => (
                      <div key={key} style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: 'var(--font-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3 }}>{key}</div>
                        <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* State updated timestamp */}
            {data.stateUpdatedAt && (
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', textAlign: 'center', padding: '4px 0' }}>
                State updated {new Date(data.stateUpdatedAt).toLocaleString()}
              </div>
            )}
            </>}
          </>
        )}

        {/* Not whitelisted notice */}
        {!hasStateAccess && publicProfile?.isAgent && (
          <div className="trader-card" style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-third)' }}>
              Agent state is only visible to whitelisted addresses.
            </div>
          </div>
        )}
      </div>

      {dwModal === 'deposit' && (
        <DepositWithdrawModal
          mode="deposit"
          withdrawableBalance={data?.trading?.withdrawable ?? 0}
          onClose={() => setDwModal(null)}
          onSuccess={() => setDwModal(null)}
        />
      )}
      {dwModal === 'withdraw-disabled' && (
        <Dialog open onOpenChange={() => setDwModal(null)}>
          <DialogContent>
            <DialogTitle className="sr-only">Withdrawals disabled</DialogTitle>
            <DialogBody>
              <div style={{ textAlign: 'center', padding: '8px 4px 4px' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
                <div style={{ fontSize: 'var(--font-md)', fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Withdrawals disabled</div>
                <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                  Withdrawals are disabled for security reasons. Ask your agent to withdraw to your account.
                </div>
                <button style={{ borderRadius: 999, background: 'var(--primary)', color: '#060a0e', fontWeight: 700, padding: '8px 24px', fontSize: 'var(--font-sm)', border: 'none', cursor: 'pointer' }} onClick={() => setDwModal(null)}>
                  Got it
                </button>
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
