import { useState, useEffect } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../ui/command'
import CoinIcon from './CoinIcon'

export default function AssetSelector({ coins, selected, allMids, onSelect }) {
  const [open, setOpen] = useState(false)

  // Close on escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="asset-selector-btn">
          <CoinIcon coin={selected} size={28} />
          <span className="asset-selector-coin">{selected}-PERP</span>
          <svg className="asset-selector-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder="Search markets..." />
          <CommandList>
            <CommandEmpty>No markets found.</CommandEmpty>
            <CommandGroup>
              {coins.filter(Boolean).map(coin => (
                <CommandItem
                  key={coin}
                  value={coin}
                  onSelect={() => {
                    onSelect(coin)
                    setOpen(false)
                  }}
                  className={coin === selected ? 'bg-[var(--primary-faded)]' : ''}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-2">
                      <CoinIcon coin={coin} size={18} />
                      <span className="font-semibold text-[13px]">{coin}-PERP</span>
                    </span>
                    {allMids[coin] && (
                      <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                        ${parseFloat(allMids[coin]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
