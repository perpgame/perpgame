import { useState, useEffect, useCallback, useRef } from 'react'
import { getMetaAndAssetCtxs } from '../api/hyperliquid'

let cachedMeta = null
let cachedAssetCtxs = null
let fetchPromise = null

export function useAssetMeta() {
  const [meta, setMeta] = useState(cachedMeta)
  const [assetCtxs, setAssetCtxs] = useState(cachedAssetCtxs)
  const [loading, setLoading] = useState(!cachedMeta)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (cachedMeta && cachedAssetCtxs) {
      setMeta(cachedMeta)
      setAssetCtxs(cachedAssetCtxs)
      setLoading(false)
      return
    }

    async function load() {
      if (!fetchPromise) {
        fetchPromise = getMetaAndAssetCtxs()
      }
      try {
        const [metaData, ctxs] = await fetchPromise
        cachedMeta = metaData
        cachedAssetCtxs = ctxs
        if (mountedRef.current) {
          setMeta(metaData)
          setAssetCtxs(ctxs)
          setLoading(false)
        }
      } catch {
        if (mountedRef.current) setLoading(false)
        fetchPromise = null
      }
    }

    load()
  }, [])

  const getAssetIndex = useCallback((coin) => {
    if (!meta?.universe) return -1
    return meta.universe.findIndex(a => a.name === coin)
  }, [meta])

  const getAssetInfo = useCallback((coin) => {
    if (!meta?.universe || !assetCtxs) return null
    const idx = meta.universe.findIndex(a => a.name === coin)
    if (idx === -1) return null
    return {
      ...meta.universe[idx],
      ctx: assetCtxs[idx],
    }
  }, [meta, assetCtxs])

  const allCoins = meta?.universe?.map(a => a.name) || []

  return {
    meta,
    assetCtxs,
    loading,
    allCoins,
    getAssetIndex,
    getAssetInfo,
  }
}
