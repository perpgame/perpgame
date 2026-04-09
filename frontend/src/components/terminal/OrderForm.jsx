import { useState, useCallback, useEffect, useMemo } from 'react'
import { Slider } from '../ui/slider'
import { Accordion, AccordionItem } from '../ui/accordion'
import { Input } from '../ui/input'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { ORDER_TYPES, ORDER_SIDES, DEFAULT_LEVERAGE } from '../../config/hyperliquid'
import { estimateLiquidationPrice } from '../../hooks/useHlTrading'
import { Button } from '../ui/button'


export default function OrderForm({ coin, markPrice, accountValue, maxLeverage: maxLev = 50, onSubmit, loading }) {
  const maxLeverage = maxLev || 50

  const [orderType, setOrderType] = useState(ORDER_TYPES.MARKET)
  const [side, setSide] = useState(ORDER_SIDES.BUY)
  const [size, setSize] = useState('')
  const [price, setPrice] = useState('')
  const [leverage, setLeverage] = useState(Math.min(DEFAULT_LEVERAGE, maxLeverage))
  const [sizePct, setSizePct] = useState(0)
  const [tpPrice, setTpPrice] = useState('')
  const [slPrice, setSlPrice] = useState('')

  useEffect(() => {
    setLeverage(prev => Math.min(prev, maxLeverage))
  }, [maxLeverage])

  useEffect(() => {
    setTpPrice('')
    setSlPrice('')
  }, [coin])

  const handleSizeChange = useCallback((val) => {
    setSize(val)
    if (!accountValue || !val) { setSizePct(0); return }
    const pct = Math.min(Math.round((parseFloat(val) / accountValue) * 100), 100)
    setSizePct(pct >= 0 ? pct : 0)
  }, [accountValue])

  const handlePctSlider = useCallback((pct) => {
    setSizePct(pct)
    if (!accountValue) return
    const margin = accountValue * (pct / 100)
    setSize(margin > 0 ? margin.toFixed(2) : '')
  }, [accountValue])

  const isBuy = side === ORDER_SIDES.BUY
  const margin = parseFloat(size || 0)
  const orderValue = margin * leverage
  const coinAmount = markPrice ? orderValue / markPrice : 0

  const liqPrice = useMemo(() => {
    if (!margin || !markPrice) return null
    return estimateLiquidationPrice({
      markPrice,
      size: coinAmount,
      leverage,
      maxLeverage,
      isLong: isBuy,
    })
  }, [margin, markPrice, coinAmount, leverage, maxLeverage, isBuy])

  const MIN_ORDER_SIZE_USD = 10.25
  const tpValid = !tpPrice || (isBuy ? parseFloat(tpPrice) > markPrice : parseFloat(tpPrice) < markPrice)
  const slValid = !slPrice || (isBuy ? parseFloat(slPrice) < markPrice : parseFloat(slPrice) > markPrice)
  const canSubmit = margin > 0 && markPrice > 0 && !loading
    && (margin * leverage) >= MIN_ORDER_SIZE_USD
    && (orderType !== ORDER_TYPES.LIMIT || (price && parseFloat(price) > 0))
    && tpValid && slValid

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !onSubmit) return
    onSubmit({
      coin,
      side,
      orderType,
      leverage,
      margin,
      markPrice,
      limitPrice: orderType === ORDER_TYPES.LIMIT ? price : null,
      tpPrice: tpPrice || null,
      slPrice: slPrice || null,
    })
  }, [canSubmit, onSubmit, coin, side, orderType, leverage, margin, markPrice, price, tpPrice, slPrice])

  return (
    <div className="order-panel">
      {/* Side toggle */}
      <div className="order-side-tabs">
        <Button className={`rounded-none flex-1 rounded-l-full font-semibold text-[15px] h-10 ${
            isBuy
              ? 'bg-[var(--profit-green)] text-[#060a0e]'
              : 'bg-[rgba(22,28,34,0.6)] text-[var(--text-third)] hover:bg-[rgba(30,36,44,0.8)] hover:text-[var(--text-secondary)]'
          }`}
          onClick={() => setSide(ORDER_SIDES.BUY)}
        >
          Long
        </Button>
        <Button className={`rounded-none flex-1 rounded-r-full font-semibold text-[15px] h-10 ${
            !isBuy
              ? 'bg-[var(--loss-red)] text-white'
              : 'bg-[rgba(22,28,34,0.6)] text-[var(--text-third)] hover:bg-[rgba(30,36,44,0.8)] hover:text-[var(--text-secondary)]'
          }`}
          onClick={() => setSide(ORDER_SIDES.SELL)}
        >
          Short
        </Button>
      </div>

      {/* Type tabs */}
      <Tabs value={orderType} onValueChange={setOrderType} className="w-full">
        <TabsList className="gap-4 w-full relative rounded-none p-0 border-b border-[var(--separator)]">
          <TabsTrigger value={ORDER_TYPES.MARKET} className="max-w-fit px-0 h-8 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-medium text-sm">Market</TabsTrigger>
          <TabsTrigger value={ORDER_TYPES.LIMIT} className="max-w-fit px-0 h-8 data-[state=active]:text-[var(--text)] text-[var(--text-third)] font-medium text-sm">Limit</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Available */}
      <div className="order-avail-row">
        <span className="text-sm text-[var(--text-secondary)]">Available</span>
        <span className="text-sm font-semibold text-[var(--text)]">{accountValue > 0 ? `${accountValue.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC` : '—'}</span>
      </div>


      {/* Size & Price */}
      <div className="order-section">
        <Input
          type="number"
          placeholder="0.00"
          value={size}
          onValueChange={handleSizeChange}
          endContent={<span className="text-xs text-[var(--text-third)]">USDC</span>}
          size="sm"
          className="text-right"
          wrapperClassName="border-[var(--border)] bg-[var(--surface)] rounded-full"
        />

        {orderType === ORDER_TYPES.LIMIT && (
          <Input
            type="number"
            placeholder="0.00"
            value={price}
            onValueChange={setPrice}
            startContent={<span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">Price</span>}
            endContent={<span className="text-xs text-[var(--text-third)]">USD</span>}
            size="sm"
            className="text-right text-sm"
            wrapperClassName="border-[var(--border)] bg-[var(--surface)] rounded-full"
          />
        )}

        <Slider
          step={1}
          minValue={0}
          maxValue={100}
          value={sizePct}
          onChange={handlePctSlider}
          label="Amount"
          getValue={v => `${v}%`}
        />
      </div>

      {/* Leverage */}
      <div className="order-section">
        <Slider
          step={1}
          minValue={1}
          maxValue={maxLeverage}
          value={leverage}
          onChange={setLeverage}
          label="Leverage"
          getValue={v => `${v}x`}
        />
      </div>

      {/* TP / SL */}
      {(() => {
        const entryPx = orderType === ORDER_TYPES.LIMIT && price ? parseFloat(price) : markPrice
        const tpPnl = tpPrice && entryPx && coinAmount
          ? (isBuy ? 1 : -1) * (parseFloat(tpPrice) - entryPx) * coinAmount
          : null
        const slPnl = slPrice && entryPx && coinAmount
          ? (isBuy ? 1 : -1) * (parseFloat(slPrice) - entryPx) * coinAmount
          : null
        const fmtPnl = (val) => {
          if (val == null || isNaN(val)) return null
          const sign = val >= 0 ? '+' : ''
          return `${sign}$${val.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
        }
        return (
          <Accordion className="px-0" defaultExpandedKeys={["tpsl"]}>
            <AccordionItem
              itemKey="tpsl"
              title="TP / SL"
            >
              <Input
                type="number"
                placeholder="0.00"
                value={tpPrice}
                onValueChange={setTpPrice}
                startContent={<span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">TP</span>}
                endContent={
                  <span className="text-xs whitespace-nowrap" style={{ color: tpPnl != null && !isNaN(tpPnl) ? (tpPnl >= 0 ? 'var(--profit-green)' : 'var(--loss-red)') : 'var(--text-third)' }}>
                    {tpPnl != null && !isNaN(tpPnl) && tpValid ? fmtPnl(tpPnl) : 'USD'}
                  </span>
                }
                size="sm"
                isInvalid={!!(tpPrice && !tpValid)}
                errorMessage={tpPrice && !tpValid ? (isBuy ? 'TP must be above mark price' : 'TP must be below mark price') : undefined}
                className="text-right text-sm"
                wrapperClassName="border-[var(--border)] bg-[var(--surface)] rounded-full"
              />
              <Input
                type="number"
                placeholder="0.00"
                value={slPrice}
                onValueChange={setSlPrice}
                startContent={<span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">SL</span>}
                endContent={
                  <span className="text-xs whitespace-nowrap" style={{ color: slPnl != null && !isNaN(slPnl) ? (slPnl >= 0 ? 'var(--profit-green)' : 'var(--loss-red)') : 'var(--text-third)' }}>
                    {slPnl != null && !isNaN(slPnl) && slValid ? fmtPnl(slPnl) : 'USD'}
                  </span>
                }
                size="sm"
                isInvalid={!!(slPrice && !slValid)}
                errorMessage={slPrice && !slValid ? (isBuy ? 'SL must be below mark price' : 'SL must be above mark price') : undefined}
                className="text-right text-sm"
                wrapperClassName="border-[var(--border)] bg-[var(--surface)] rounded-full"
              />
            </AccordionItem>
          </Accordion>
        )
      })()}

      {/* Summary */}
      {margin > 0 && markPrice && (
        <div className="order-summary">
          <div className="order-summary-row">
            <span>Position Size</span>
            <span>${orderValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="order-summary-row">
            <span>Margin</span>
            <span>${margin.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          </div>
          {liqPrice && (
            <div className="order-summary-row">
              <span>Est. Liq. Price</span>
              <span style={{ color: 'var(--loss-red)' }}>
                ${liqPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      <Button disabled={!canSubmit}
        loading={loading}
        onClick={handleSubmit}
        className={`w-full rounded-full mt-auto font-semibold text-base ${
          isBuy
            ? 'bg-[var(--profit-green)] text-[#060a0e]'
            : 'bg-[var(--loss-red)] text-white'
        }`}
        size="lg"
      >
        {isBuy ? `Long ${coin}` : `Short ${coin}`}
      </Button>
    </div>
  )
}
