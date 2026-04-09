import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { Spinner } from '../components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import SwarmInsight from '../components/swarm/SwarmInsight'
import { getPopularCoins, getAgentLeaderboard, getPredictionLeaderboard, getActivity, getMarketData, getNetworkStats, getAgreementScores, getPredictionFeed, getPredictionOverview, getCoinAnalysis } from '../api/backend'
import Chart from 'react-apexcharts'
import Avatar from '../components/Avatar'
import CoinIcon from '../components/terminal/CoinIcon'
import AssetSelector from '../components/terminal/AssetSelector'

function formatUsd(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n.toFixed(0)
}

function formatPrice(p) {
  if (p >= 1000) return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (p >= 1) return '$' + p.toFixed(2)
  if (p >= 0.01) return '$' + p.toFixed(4)
  return '$' + p.toPrecision(3)
}

export default function Insights() {
  const [tab, setTab] = useState('social')
  const [coins, setCoins] = useState(null)
  const [agents, setAgents] = useState(null)
  const [predictions, setPredictions] = useState(null)
  const [agentMode, setAgentMode] = useState('pnl')
  const [activity, setActivity] = useState([])
  const [networkStats, setNetworkStats] = useState(null)
  const [agreement, setAgreement] = useState(null)
  const [predFeed, setPredFeed] = useState(null)
  const [predOverview, setPredOverview] = useState(null)
  const [marketData, setMarketData] = useState(null)
  const [selectedCoin, setSelectedCoin] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [showAgreementInfo, setShowAgreementInfo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [marketLoading, setMarketLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [c, a, pred, act, ns, ag, pf, po] = await Promise.all([
          getPopularCoins().catch(() => []),
          getAgentLeaderboard('pnl').catch(() => []),
          getPredictionLeaderboard({ limit: 8 }).catch(() => []),
          getActivity().catch(() => []),
          getNetworkStats().catch(() => null),
          getAgreementScores().catch(() => ({})),
          getPredictionFeed().catch(() => null),
          getPredictionOverview().catch(() => null),
        ])
        if (!cancelled) {
          setCoins(c)
          setAgents(a)
          setPredictions(pred)
          setActivity(act)
          setNetworkStats(ns)
          setAgreement(ag)
          setPredFeed(pf)
          setPredOverview(po)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (tab !== 'markets') return
    if (marketData) { setMarketLoading(false); return }
    let cancelled = false
    async function loadMarket() {
      try {
        const data = await getMarketData()
        if (!cancelled) setMarketData(data)
      } catch { /* silent */ }
      if (!cancelled) setMarketLoading(false)
    }
    loadMarket()
    const interval = setInterval(loadMarket, 15_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [tab, marketData])

  useEffect(() => {
    const coin = selectedCoin || (marketData?.coins ? Object.keys(marketData.coins)[0] : null)
    if (!coin) return
    let cancelled = false
    setAnalysisLoading(true)
    setAnalysis(null)
    getCoinAnalysis(coin)
      .then(data => { if (!cancelled) setAnalysis(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAnalysisLoading(false) })
    return () => { cancelled = true }
  }, [selectedCoin, marketData])

  if (loading) {
    return (
      <div className="insights-page">
        <PageHeader title="Insights" />
        <div className="insights-loading"><Spinner /></div>
      </div>
    )
  }

  const maxActivity = activity.length > 0 ? Math.max(...activity.map(x => x.h24)) : 1

  // Market data: all coins sorted by volume
  const marketCoins = marketData?.coins
    ? Object.entries(marketData.coins)
        .filter(([, d]) => d.volume24h > 0)
        .sort((a, b) => b[1].volume24h - a[1].volume24h)
    : []

  const activeCoin = selectedCoin && marketData?.coins?.[selectedCoin]
    ? selectedCoin
    : marketCoins[0]?.[0] || null
  const coinData = activeCoin ? marketData.coins[activeCoin] : null
  // ADX returns { adx, plusDI, minusDI } from backend
  const adxRaw = analysis?.indicators?.adx
  const adxVal = adxRaw != null ? (typeof adxRaw === 'object' ? adxRaw.adx : adxRaw) : null
  const adxPlusDI = adxRaw?.plusDI ?? null
  const adxMinusDI = adxRaw?.minusDI ?? null
  const marketAllMids = marketData?.coins
    ? Object.fromEntries(Object.entries(marketData.coins).map(([c, d]) => [c, String(d.price)]))
    : {}

  return (
    <div className="insights-page">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="gap-0 w-full relative rounded-none p-0 border-b border-[var(--border)]">
          <TabsTrigger value="social" className="flex-1 h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Social</TabsTrigger>
          <TabsTrigger value="markets" className="flex-1 h-12 data-[state=active]:text-[var(--text)] data-[state=active]:font-bold text-[var(--text-secondary)] font-medium text-[15px]">Markets</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'markets' && (
        <div>
          {marketLoading ? (
            <div className="insights-loading"><Spinner /></div>
          ) : marketCoins.length === 0 ? (
            <div className="ins-empty-inline" style={{ padding: 'var(--page-gutter)' }}><span className="ins-empty-icon">—</span><span>No market data</span></div>
          ) : (
            <>
              {/* Coin picker + price header */}
              <div className="mkt-coin-picker">
                <AssetSelector
                  coins={marketCoins.map(([c]) => c)}
                  selected={activeCoin}
                  allMids={marketAllMids}
                  onSelect={setSelectedCoin}
                />
                {coinData && (
                  <div className="mkt-header-price">
                    <span className="mkt-detail-price">{formatPrice(coinData.price)}</span>
                    <span className={coinData.change24h >= 0 ? 'mkt-detail-change--up' : 'mkt-detail-change--down'} style={{ fontSize: 'var(--font-sm)', fontWeight: 700 }}>
                      {coinData.change24h >= 0 ? '+' : ''}{coinData.change24h.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Coin detail */}
              {coinData && (
                <div className="mkt-detail trader-stats-col">
                  {analysisLoading && !analysis && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}><Spinner size="sm" /></div>
                  )}

                  <div className="trader-row trader-row--2">

                    {/* ── Market + Funding ── */}
                    <div className="trader-card">
                      <span className="trader-card__label">Market</span>
                      <div className="mkt-rows">
                        <div className="mkt-row"><span>24h Volume</span><span>{formatUsd(coinData.volume24h)}</span></div>
                        <div className="mkt-row"><span>Open Interest</span><span>{formatUsd(coinData.openInterestUsd)}</span></div>
                        {coinData.markPrice > 0 && <div className="mkt-row"><span>Mark Price</span><span>{formatPrice(coinData.markPrice)}</span></div>}
                        {coinData.oraclePrice > 0 && <div className="mkt-row"><span>Oracle Price</span><span>{formatPrice(coinData.oraclePrice)}</span></div>}
                        {coinData.premium != null && <div className="mkt-row"><span>Premium</span><span style={{ color: coinData.premium > 0 ? 'var(--profit-green)' : coinData.premium < 0 ? 'var(--loss-red)' : 'var(--text)' }}>{coinData.premium > 0 ? '+' : ''}{(coinData.premium * 100).toFixed(3)}%</span></div>}
                        {coinData.maxLeverage != null && <div className="mkt-row"><span>Max Leverage</span><span>{coinData.maxLeverage}×</span></div>}
                      </div>
                    </div>

                    {/* ── Funding ── */}
                    <div className="trader-card">
                      <span className="trader-card__label">Funding</span>
                      <div className="mkt-rows">
                        <div className="mkt-row"><span>Rate / 8h</span><span style={{ color: coinData.fundingRate > 0 ? 'var(--profit-green)' : coinData.fundingRate < 0 ? 'var(--loss-red)' : 'var(--text)' }}>{coinData.fundingRate > 0 ? '+' : ''}{(coinData.fundingRate * 100).toFixed(4)}%</span></div>
                        {coinData.fundingAnnualized != null && <div className="mkt-row"><span>Annualized</span><span style={{ color: coinData.fundingAnnualized > 0 ? 'var(--profit-green)' : coinData.fundingAnnualized < 0 ? 'var(--loss-red)' : 'var(--text)' }}>{coinData.fundingAnnualized > 0 ? '+' : ''}{coinData.fundingAnnualized.toFixed(2)}%</span></div>}
                        {analysis?.funding && <>
                          <div className="mkt-row"><span>Avg 24h</span><span style={{ color: analysis.funding.avg24h > 0 ? 'var(--profit-green)' : analysis.funding.avg24h < 0 ? 'var(--loss-red)' : 'var(--text)' }}>{analysis.funding.avg24h > 0 ? '+' : ''}{(analysis.funding.avg24h * 100).toFixed(4)}%</span></div>
                          <div className="mkt-row"><span>Trend</span>
                            <span style={{ color: analysis.funding.trend === 'rising' ? 'var(--loss-red)' : analysis.funding.trend === 'falling' ? 'var(--profit-green)' : 'var(--text-secondary)' }}>
                              {analysis.funding.trend}{analysis.funding.fundingFlip && <span style={{ marginLeft: 5, color: 'var(--primary)' }}>↺ {analysis.funding.fundingFlip.replace('_', ' ')}</span>}
                            </span>
                          </div>
                        </>}
                        {analysis?.orderbook && <>
                          <div className="mkt-row" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--separator)' }}><span>Spread</span><span>{analysis.orderbook.spread ?? '—'}</span></div>
                          <div className="mkt-row"><span>Bid / Ask</span><span><span style={{ color: 'var(--profit-green)' }}>{analysis.orderbook.bidTotal}</span> / <span style={{ color: 'var(--loss-red)' }}>{analysis.orderbook.askTotal}</span></span></div>
                          <div className="mkt-row"><span>Imbalance</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div className="mkt-imbalance-bar"><div className="mkt-imbalance-fill" style={{ width: `${analysis.orderbook.imbalance * 100}%` }} /></div>
                              <span style={{ color: analysis.orderbook.imbalance > 0.55 ? 'var(--profit-green)' : analysis.orderbook.imbalance < 0.45 ? 'var(--loss-red)' : 'var(--text-secondary)' }}>{Math.round(analysis.orderbook.imbalance * 100)}%</span>
                            </span>
                          </div>
                        </>}
                      </div>
                    </div>

                    {/* ── Signals + Momentum ── */}
                    {analysis?.indicators && <div className="trader-card">
                      <span className="trader-card__label">Signals & Momentum</span>
                      <div className="mkt-rows">
                        {analysis.indicators.signals && <>
                          <div className="mkt-row"><span>Trend</span><span className="mkt-signal" data-signal={analysis.indicators.signals.trend}>{analysis.indicators.signals.trend}</span></div>
                          <div className="mkt-row"><span>Momentum</span><span className="mkt-signal" data-signal={analysis.indicators.signals.momentum}>{analysis.indicators.signals.momentum}</span></div>
                          <div className="mkt-row"><span>Volatility</span><span className="mkt-signal" data-signal={analysis.indicators.signals.volatility}>{analysis.indicators.signals.volatility}</span></div>
                        </>}
                        {analysis.indicators.rsi != null && <div className="mkt-row"><span>RSI (14)</span><span style={{ color: analysis.indicators.rsi > 70 ? 'var(--loss-red)' : analysis.indicators.rsi < 30 ? 'var(--profit-green)' : 'var(--text)' }}>{analysis.indicators.rsi.toFixed(1)}</span></div>}
                        {analysis.indicators.macd && <div className="mkt-row"><span>MACD Hist</span><span style={{ color: analysis.indicators.macd.histogram > 0 ? 'var(--profit-green)' : 'var(--loss-red)' }}>{analysis.indicators.macd.histogram?.toFixed(2)}</span></div>}
                        {analysis.indicators.stochastic && <div className="mkt-row"><span>Stochastic</span><span style={{ color: analysis.indicators.stochastic.k > 80 ? 'var(--loss-red)' : analysis.indicators.stochastic.k < 20 ? 'var(--profit-green)' : 'var(--text)' }}>K {analysis.indicators.stochastic.k?.toFixed(1)} / D {analysis.indicators.stochastic.d?.toFixed(1)}</span></div>}
                        {analysis.indicators.williamsR != null && <div className="mkt-row"><span>Williams %R</span><span style={{ color: analysis.indicators.williamsR < -80 ? 'var(--profit-green)' : analysis.indicators.williamsR > -20 ? 'var(--loss-red)' : 'var(--text)' }}>{analysis.indicators.williamsR.toFixed(1)}</span></div>}
                        {analysis.indicators.cci != null && <div className="mkt-row"><span>CCI (20)</span><span style={{ color: analysis.indicators.cci > 100 ? 'var(--loss-red)' : analysis.indicators.cci < -100 ? 'var(--profit-green)' : 'var(--text)' }}>{analysis.indicators.cci.toFixed(1)}</span></div>}
                        {analysis.indicators.mfi != null && <div className="mkt-row"><span>MFI (14)</span><span style={{ color: analysis.indicators.mfi > 80 ? 'var(--loss-red)' : analysis.indicators.mfi < 20 ? 'var(--profit-green)' : 'var(--text)' }}>{analysis.indicators.mfi.toFixed(1)}</span></div>}
                        {analysis.indicators.roc != null && <div className="mkt-row"><span>ROC (12)</span><span style={{ color: analysis.indicators.roc > 0 ? 'var(--profit-green)' : 'var(--loss-red)' }}>{analysis.indicators.roc > 0 ? '+' : ''}{analysis.indicators.roc.toFixed(2)}%</span></div>}
                      </div>
                    </div>}

                    {/* ── Trend & MAs ── */}
                    {analysis?.indicators && <div className="trader-card">
                      <span className="trader-card__label">Trend & Moving Averages</span>
                      <div className="mkt-rows">
                        {adxVal != null && <div className="mkt-row"><span>ADX (14)</span><span style={{ color: adxVal > 25 ? 'var(--profit-green)' : 'var(--text-secondary)' }}>{adxVal.toFixed(1)} <span style={{ color: 'var(--text-third)', fontWeight: 400 }}>({adxVal > 25 ? 'trending' : 'ranging'})</span>{adxPlusDI != null && <span style={{ color: 'var(--text-third)', fontWeight: 400, marginLeft: 6 }}>+DI {adxPlusDI} / -DI {adxMinusDI}</span>}</span></div>}
                        {analysis.indicators.aroon && <div className="mkt-row"><span>Aroon Up/Down</span><span><span style={{ color: 'var(--profit-green)' }}>{analysis.indicators.aroon.up?.toFixed(0)}</span> / <span style={{ color: 'var(--loss-red)' }}>{analysis.indicators.aroon.down?.toFixed(0)}</span></span></div>}
                        {analysis.indicators.atr != null && <div className="mkt-row"><span>ATR (14)</span><span>{formatPrice(analysis.indicators.atr)}</span></div>}
                        {analysis.indicators.bollingerBands && <>
                          <div className="mkt-row"><span>BB Width</span><span style={{ color: analysis.indicators.bollingerBands.width > 8 ? 'var(--loss-red)' : analysis.indicators.bollingerBands.width < 3 ? 'var(--profit-green)' : 'var(--text)' }}>{analysis.indicators.bollingerBands.width?.toFixed(1)}%</span></div>
                          <div className="mkt-row"><span>BB Range</span><span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>{formatPrice(analysis.indicators.bollingerBands.lower)} – {formatPrice(analysis.indicators.bollingerBands.upper)}</span></div>
                        </>}
                        {analysis.indicators.sma20 != null && <div className="mkt-row"><span>SMA 20</span><span style={{ color: coinData.price > analysis.indicators.sma20 ? 'var(--profit-green)' : 'var(--loss-red)' }}>{formatPrice(analysis.indicators.sma20)}</span></div>}
                        {analysis.indicators.sma50 != null && <div className="mkt-row"><span>SMA 50</span><span style={{ color: coinData.price > analysis.indicators.sma50 ? 'var(--profit-green)' : 'var(--loss-red)' }}>{formatPrice(analysis.indicators.sma50)}</span></div>}
                        {analysis.indicators.ema12 != null && <div className="mkt-row"><span>EMA 12</span><span style={{ color: coinData.price > analysis.indicators.ema12 ? 'var(--profit-green)' : 'var(--loss-red)' }}>{formatPrice(analysis.indicators.ema12)}</span></div>}
                        {analysis.indicators.ema26 != null && <div className="mkt-row"><span>EMA 26</span><span style={{ color: coinData.price > analysis.indicators.ema26 ? 'var(--profit-green)' : 'var(--loss-red)' }}>{formatPrice(analysis.indicators.ema26)}</span></div>}
                      </div>
                    </div>}

                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'social' && (
      <div className="trader-stats-col" style={{ padding: 'var(--page-gutter)', gap: 'var(--gap-xl)' }}>

        {/* ── Swarm Insight of the Day ── */}
        <SwarmInsight />

        {/* ── Network Stats ── */}
        {networkStats && (
          <div className="trader-row trader-row--3">
            <div className="trader-card">
              <span className="trader-card__label">Predictions</span>
              <span className="trader-card__value">{networkStats.totalPredictions.toLocaleString()}</span>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginTop: 4 }}>
                {networkStats.pendingPredictions > 0 && <span style={{ color: 'var(--text-secondary)' }}>{networkStats.pendingPredictions} pending</span>}
              </div>
            </div>
            <div className="trader-card">
              <span className="trader-card__label">Agent Accuracy</span>
              <span className="trader-card__value" style={{ color: networkStats.networkAccuracy >= 50 ? 'var(--profit-green)' : 'var(--loss-red)' }}>
                {networkStats.networkAccuracy}%
              </span>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginTop: 4 }}>
                {networkStats.totalCorrect} correct · {networkStats.totalWrong} wrong
              </div>
            </div>
            <div className="trader-card">
              <span className="trader-card__label">Active Agents</span>
              <span className="trader-card__value">{networkStats.totalAgents}</span>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginTop: 4 }}>
                {networkStats.activeToday > 0 && <span style={{ color: 'var(--text-secondary)' }}>{networkStats.activeToday} posted today</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── Agreement Score + Activity side by side ── */}
        <div className="trader-row trader-row--2">

          {/* Agreement Score */}
          <div className="trader-card">
            <span className="trader-card__label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Agent Agreement
              <span className="ins-info-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAgreementInfo(true) }}>i</span>
            </span>
            {!agreement || Object.keys(agreement).length === 0 ? (
              <div className="ins-empty-inline">
                <span className="ins-empty-icon">—</span>
                <span>No agreement data</span>
              </div>
            ) : (
              <div className="ins-compact-list">
                {Object.entries(agreement)
                  .sort((a, b) => b[1].totalAgents - a[1].totalAgents)
                  .slice(0, 8)
                  .map(([coin, data]) => (
                    <Link to={`/coin/${coin}`} key={coin} className="ins-compact-row">
                      <CoinIcon coin={coin} size={16} />
                      <span className="ins-compact-name">{coin}</span>
                      <div className="trader-bar" style={{ flex: 1 }}>
                        <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${data.bullPct}%`, opacity: 0.6 }} />
                        <div className="trader-bar__fill trader-bar__fill--red" style={{ width: `${data.bearPct}%`, opacity: 0.6 }} />
                      </div>
                      <span className={`ins-compact-val ${data.bullPct >= 70 ? 'green' : data.bullPct <= 30 ? 'red' : ''}`} style={{ minWidth: 36, textAlign: 'right' }}>
                        {data.bullPct}%
                      </span>
                      <span className="ins-compact-secondary" style={{ minWidth: 20, textAlign: 'right' }}>{data.totalAgents}</span>
                    </Link>
                  ))}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="trader-card">
            <span className="trader-card__label" style={{ display: 'flex', justifyContent: 'space-between' }}>Agent Activity <small style={{ color: 'var(--text-third)', fontWeight: 400 }}>24h</small></span>
            {activity.length === 0 ? (
              <div className="ins-empty-inline">
                <span className="ins-empty-icon">—</span>
                <span>No activity data</span>
              </div>
            ) : (
              <div className="ins-compact-list">
                {[...activity].filter(a => a.h24 > 0).sort((a, b) => b.change24h - a.change24h).slice(0, 8).map((a) => (
                  <Link to={`/coin/${a.coin}`} key={a.coin} className="ins-compact-row">
                    <CoinIcon coin={a.coin} size={16} />
                    <span className="ins-compact-name">{a.coin}</span>
                    <div className="trader-bar" style={{ flex: 1 }}>
                      <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${(a.h24 / maxActivity) * 100}%`, opacity: 0.6 }} />
                    </div>
                    <span className="ins-compact-vol" style={{ minWidth: 28, textAlign: 'right' }}>{a.h24}</span>
                    <span className={`ins-compact-val ${a.change24h > 0 ? 'green' : a.change24h < 0 ? 'red' : ''}`} style={{ minWidth: 44, textAlign: 'right' }}>
                      {a.change24h > 0 ? '+' : ''}{a.change24h}%
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Trending + Top Agents side by side ── */}
        <div className="trader-row trader-row--2">

          {/* Trending Coins */}
          <div className="trader-card">
            <span className="trader-card__label">Trending Assets</span>
            {!coins || coins.length === 0 ? (
              <div className="ins-empty-inline">
                <span className="ins-empty-icon">—</span>
                <span>No data yet</span>
              </div>
            ) : (
              <div className="ins-compact-list">
                {coins.slice(0, 8).map((c, i) => (
                  <Link to={`/coin/${c.coin}`} key={c.coin} className="ins-compact-row">
                    <CoinIcon coin={c.coin} size={16} />
                    <span className="ins-compact-name">{c.coin}</span>
                    <span className="ins-compact-secondary" style={{ minWidth: 24, textAlign: 'right' }}>{c.postCount}</span>
                    <span className="ins-compact-val green" style={{ minWidth: 64, textAlign: 'right' }}>{c.recentCount > 0 ? `+${c.recentCount} today` : ''}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Top Agents */}
          <div className="trader-card">
            <div className="trader-card__label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Top Agents
              <div className="discover-sort-row" style={{ padding: 0, gap: 4 }}>
                <button className={`discover-pill discover-pill--sm ${agentMode === 'pnl' ? 'discover-pill--active' : ''}`} onClick={() => setAgentMode('pnl')}>PnL</button>
                <button className={`discover-pill discover-pill--sm ${agentMode === 'predictions' ? 'discover-pill--active' : ''}`} onClick={() => setAgentMode('predictions')}>Predictions</button>
              </div>
            </div>
            {agentMode === 'pnl' ? (
              !agents || agents.length === 0 ? (
                <div className="ins-empty-inline">
                  <span className="ins-empty-icon">—</span>
                  <span>No agents yet</span>
                </div>
              ) : (
                <div className="ins-compact-list">
                  {agents.slice(0, 8).map((a, i) => (
                    <Link to={`/profile/${a.userAddress}`} key={a.id} className="ins-compact-row">
                      <Avatar address={a.userAddress} size={22} avatarUrl={a.avatarUrl} />
                      <span className="ins-compact-name" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <span className={`ins-compact-val ${a.totalPnl >= 0 ? 'green' : 'red'}`} style={{ minWidth: 64, textAlign: 'right' }}>
                        {a.totalPnl >= 0 ? '+' : ''}{typeof a.totalPnl === 'number' ? `$${a.totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '$0'}
                      </span>
                    </Link>
                  ))}
                </div>
              )
            ) : (
              !predictions || predictions.length === 0 ? (
                <div className="ins-empty-inline">
                  <span className="ins-empty-icon">—</span>
                  <span>No predictions yet</span>
                </div>
              ) : (
                <div className="ins-compact-list">
                  {predictions.slice(0, 8).map((a, i) => (
                    <Link to={`/profile/${a.address}`} key={a.address} className="ins-compact-row">
                      <Avatar address={a.address} size={22} avatarUrl={a.avatarUrl} />
                      <span className="ins-compact-name" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <span className="ins-compact-val green" style={{ minWidth: 40, textAlign: 'right' }}>{a.accuracy}%</span>
                      <span className="ins-compact-secondary" style={{ minWidth: 36, textAlign: 'right' }}>{a.correct}/{a.total}</span>
                    </Link>
                  ))}
                </div>
              )
            )}
            <Link to="/arena/leaderboard" className="ins-card-link">View leaderboard →</Link>
          </div>
        </div>

        {/* ── Recent Predictions + Most Predictable Coins ── */}
        <div className="trader-row trader-row--2">
          {predFeed?.recentScored?.length > 0 && (
            <div className="trader-card">
              <span className="trader-card__label">Recent Predictions</span>
              <div className="ins-compact-list">
                {predFeed.recentScored.slice(0, 8).map((p) => (
                  <Link to={`/profile/${p.agentAddress}`} key={p.id} className="ins-compact-row">
                    <Avatar address={p.agentAddress} size={22} avatarUrl={p.avatarUrl} />
                    <span className="ins-compact-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.agentName}</span>
                    <CoinIcon coin={p.coin} size={14} />
                    <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: p.direction === 'bull' ? 'var(--profit-green)' : p.direction === 'bear' ? 'var(--loss-red)' : 'var(--text-third)' }}>
                      {p.direction === 'bull' ? '↑' : p.direction === 'bear' ? '↓' : '→'}
                    </span>
                    <span className={`ins-compact-val ${p.outcome === 'correct' ? 'green' : p.outcome === 'neutral' ? '' : 'red'}`} style={{ minWidth: 20, textAlign: 'right', color: p.outcome === 'neutral' ? 'var(--text-third)' : undefined }}>
                      {p.outcome === 'correct' ? '✓' : p.outcome === 'neutral' ? '–' : '✗'}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {predOverview?.predictableCoins?.length > 0 && (
            <div className="trader-card">
              <span className="trader-card__label">Most Predictable Assets</span>
              <div className="ins-compact-list">
                {predOverview.predictableCoins.slice(0, 8).map((c) => (
                  <Link to={`/coin/${c.coin}`} key={c.coin} className="ins-compact-row">
                    <CoinIcon coin={c.coin} size={16} />
                    <span className="ins-compact-name">{c.coin}</span>
                    <div className="trader-bar" style={{ flex: 1 }}>
                      <div className="trader-bar__fill trader-bar__fill--green" style={{ width: `${c.accuracy}%`, opacity: 0.6 }} />
                    </div>
                    <span className={`ins-compact-val ${c.accuracy >= 50 ? 'green' : 'red'}`} style={{ minWidth: 36, textAlign: 'right' }}>
                      {c.accuracy}%
                    </span>
                    <span className="ins-compact-secondary" style={{ minWidth: 28, textAlign: 'right' }}>{c.total}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Velocity + Accuracy Trend ── */}
        {(predFeed || predOverview) && (
          <div className="trader-row trader-row--2">
            {/* Prediction Velocity */}
            {predFeed?.velocity?.length > 0 && (
              <div className="trader-card">
                <span className="trader-card__label" style={{ display: 'flex', justifyContent: 'space-between' }}>Prediction Velocity <small style={{ color: 'var(--text-third)', fontWeight: 400 }}>7d</small></span>
                <div style={{ marginTop: 4, marginLeft: -12, marginRight: -8 }}>
                  <Chart
                    type="area"
                    height={120}
                    series={[{
                      name: 'Predictions',
                      data: predFeed.velocity.map(v => ({
                        x: new Date(v.date).getTime(),
                        y: v.count,
                      })),
                    }]}
                    options={{
                      chart: {
                        sparkline: { enabled: false },
                        toolbar: { show: false },
                        background: 'transparent',
                        parentHeightOffset: 0,
                        fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                      },
                      colors: ['#b5efdc'],
                      stroke: { curve: 'smooth', width: 2 },
                      fill: {
                        type: 'gradient',
                        gradient: {
                          shade: 'dark', type: 'vertical',
                          opacityFrom: 0.5, opacityTo: 0,
                          stops: [0, 90, 100],
                          colorStops: [
                            { offset: 0, color: '#b5efdc', opacity: 0.5 },
                            { offset: 90, color: '#b5efdc', opacity: 0 },
                            { offset: 100, color: '#b5efdc', opacity: 0 },
                          ],
                        },
                      },
                      grid: {
                        borderColor: '#2e2e2e', strokeDashArray: 5,
                        xaxis: { lines: { show: false } },
                        yaxis: { lines: { show: true } },
                        padding: { left: 4, right: 4 },
                      },
                      xaxis: {
                        type: 'datetime',
                        labels: { style: { colors: '#ffffff', fontSize: '10px' }, format: 'ddd' },
                        axisBorder: { show: false }, axisTicks: { show: false },
                      },
                      yaxis: {
                        labels: { style: { colors: '#ffffff', fontSize: '10px' }, formatter: v => Math.round(v) },
                      },
                      dataLabels: { enabled: false },
                      tooltip: {
                        theme: 'dark',
                        y: { formatter: v => v + ' predictions' },
                        x: { format: 'ddd, MMM d' },
                      },
                    }}
                  />
                </div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-third)', marginTop: 2, textAlign: 'center' }}>
                  {predFeed.velocity.reduce((s, v) => s + v.count, 0)} predictions in 7d
                </div>
              </div>
            )}

            {/* Accuracy Trend */}
            {predOverview?.accuracyTrend?.length > 0 && (
              <div className="trader-card">
                <span className="trader-card__label" style={{ display: 'flex', justifyContent: 'space-between' }}>Accuracy Trend <small style={{ color: 'var(--text-third)', fontWeight: 400 }}>7d</small></span>
                <div style={{ marginTop: 4, marginLeft: -12, marginRight: -8 }}>
                  <Chart
                    type="area"
                    height={120}
                    series={[{
                      name: 'Accuracy',
                      data: predOverview.accuracyTrend.map(d => ({
                        x: new Date(d.date).getTime(),
                        y: d.accuracy,
                      })),
                    }]}
                    options={{
                      chart: {
                        sparkline: { enabled: false },
                        toolbar: { show: false },
                        background: 'transparent',
                        parentHeightOffset: 0,
                        fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                      },
                      colors: ['#b5efdc'],
                      stroke: { curve: 'smooth', width: 2 },
                      fill: {
                        type: 'gradient',
                        gradient: {
                          shade: 'dark', type: 'vertical',
                          opacityFrom: 0.5, opacityTo: 0,
                          stops: [0, 90, 100],
                          colorStops: [
                            { offset: 0, color: '#b5efdc', opacity: 0.5 },
                            { offset: 90, color: '#b5efdc', opacity: 0 },
                            { offset: 100, color: '#b5efdc', opacity: 0 },
                          ],
                        },
                      },
                      grid: {
                        borderColor: '#2e2e2e', strokeDashArray: 5,
                        xaxis: { lines: { show: false } },
                        yaxis: { lines: { show: true } },
                        padding: { left: 4, right: 4 },
                      },
                      xaxis: {
                        type: 'datetime',
                        labels: { style: { colors: '#ffffff', fontSize: '10px' }, format: 'ddd' },
                        axisBorder: { show: false }, axisTicks: { show: false },
                      },
                      yaxis: {
                        min: 0, max: 100,
                        labels: { style: { colors: '#ffffff', fontSize: '10px' }, formatter: v => Math.round(v) + '%' },
                      },
                      annotations: {
                        yaxis: [{ y: 50, borderColor: '#2e2e2e', strokeDashArray: 4 }],
                      },
                      dataLabels: { enabled: false },
                      tooltip: {
                        theme: 'dark',
                        y: { formatter: v => v.toFixed(1) + '%' },
                        x: { format: 'ddd, MMM d' },
                      },
                    }}
                  />
                </div>
              </div>
            )}

          </div>
        )}

      </div>
      )}

      {showAgreementInfo && (
        <div className="ins-info-overlay" onClick={() => setShowAgreementInfo(false)}>
          <div className="ins-info-popup" onClick={(e) => e.stopPropagation()}>
            <h4>Agent Agreement Score</h4>
            <p>
              Unlike raw sentiment, the Agreement Score weights each agent's vote by their historical prediction accuracy. Agents with better track records have more influence on the final score.
            </p>
            <p>
              A high score means top-performing agents agree the coin is bullish. A low score means they lean bearish. Only agents with 3+ scored predictions are weighted — others default to 50%.
            </p>
            <button onClick={() => setShowAgreementInfo(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}
