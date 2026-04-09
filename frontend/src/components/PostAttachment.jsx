import { Card, CardBody } from './ui/card'
import PnLChart from './PnLChart'
import { formatUsd } from '../api/hyperliquid'
import { formatPrice, getPnlColor } from '../utils/format'
import CoinIcon from './terminal/CoinIcon'
import { Chip } from './ui/chip'

function LiquidationCard({ data }) {
  const lossPct = data.entryPrice && data.size
    ? ((data.loss / (data.entryPrice * data.size)) * 100).toFixed(2)
    : null
  const isLong = data.side === 'Long'
  const posValue = Math.abs(data.size) * data.entryPrice

  return (
    <div className="positions-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Coin</th>
            <th>Type</th>
            <th>Position Value</th>
            <th>Entry Price</th>
            <th>Liq. Price</th>
            <th>Loss</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <span className="positions-coin-cell">
                <CoinIcon coin={data.coin} size={16} />
                <span className="positions-coin-name">{data.coin}</span>
              </span>
            </td>
            <td>
              <Chip size="sm"
                className={`${isLong ? 'bg-[rgba(181,239,220,0.1)]' : 'bg-[rgba(246,70,93,0.1)]'} text-[10px] font-semibold px-1 ${isLong ? 'text-[var(--profit-green)]' : 'text-[var(--loss-red)]'}`}
              >
                {data.side}{data.leverage > 1 ? ` · ${data.leverage}X` : ''}
              </Chip>
            </td>
            <td>{formatUsd(posValue)}</td>
            <td>{formatPrice(data.entryPrice)}</td>
            <td style={{ color: 'var(--loss-red)' }}>{formatPrice(data.liqPrice)}</td>
            <td style={{ color: 'var(--loss-red)' }}>
              {formatUsd(data.loss)}{lossPct ? ` (${lossPct}%)` : ''}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function TradeReplayCard({ data }) {
  const pnlColor = getPnlColor(data.pnl)
  const pnlPct = data.entryPrice && data.size
    ? ((data.pnl / (data.entryPrice * data.size)) * 100).toFixed(2)
    : null
  const isLong = data.side === 'Long'
  const posValue = Math.abs(data.size) * data.exitPrice

  return (
    <div className="positions-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Coin</th>
            <th>Type</th>
            <th>Position Value</th>
            <th>Entry Price</th>
            <th>Exit Price</th>
            <th>PnL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <span className="positions-coin-cell">
                <CoinIcon coin={data.coin} size={16} />
                <span className="positions-coin-name">{data.coin}</span>
              </span>
            </td>
            <td>
              <Chip size="sm"
                className={`${isLong ? 'bg-[rgba(181,239,220,0.1)]' : 'bg-[rgba(246,70,93,0.1)]'} text-[10px] font-semibold px-1 ${isLong ? 'text-[var(--profit-green)]' : 'text-[var(--loss-red)]'}`}
              >
                {data.side}{data.leverage > 1 ? ` · ${data.leverage}X` : ''}
              </Chip>
            </td>
            <td>{formatUsd(posValue)}</td>
            <td>{formatPrice(data.entryPrice)}</td>
            <td>{formatPrice(data.exitPrice)}</td>
            <td style={{ color: pnlColor }}>
              {formatUsd(data.pnl)}{pnlPct ? ` (${pnlPct}%)` : ''}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function PostAttachment({ attachment, size = 'default' }) {
  if (!attachment) return null

  const compact = size === 'compact'
  const chartHeight = compact ? 140 : 200

  return (
    <Card
      className={`bg-transparent border border-[rgba(255,255,255,0.08)] ${compact ? 'text-[13px]' : ''}`}
    >
      <CardBody className="p-0">
        {attachment.type === 'chart' && (
          <div className="py-1">
            <PnLChart data={attachment.data.timeline} height={chartHeight} title="PnL Chart" />
          </div>
        )}
        {attachment.type === 'liquidation' && <LiquidationCard data={attachment.data} />}
        {attachment.type === 'trade' && <TradeReplayCard data={attachment.data} />}
      </CardBody>
    </Card>
  )
}
