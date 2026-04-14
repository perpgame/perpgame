import { hlInfoPost } from "./lib/hlClient.js";

let assetMeta = null;

export const loadMeta = async () => {
  const data = await hlInfoPost({ type: "meta" });
  const { universe } = data;
  assetMeta = new Map(
    universe.map((asset, i) => [asset.name, { index: i, szDecimals: asset.szDecimals }])
  );
};

export const getAssetMeta = (coin) => assetMeta?.get(coin);
export const isValidCoin = (coin) => assetMeta?.has(coin) ?? false;
export const getTotalCoins = () => assetMeta?.size ?? 0;

/** Seed asset meta — merges into existing meta or creates new */
export const seedMeta = (coins) => {
  if (!assetMeta) assetMeta = new Map();
  for (const name of coins) {
    if (!assetMeta.has(name)) {
      assetMeta.set(name, { index: assetMeta.size, szDecimals: 0 });
    }
  }
};
