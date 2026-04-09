import { parseArgs } from "node:util";
import HyperliquidClient from "../hyperliquid.js";

const ONRAMPER_URL = "https://buy.onramper.com";
const SIGNING_API = "https://ledger-scanner.s1.plug-wallet.com";
const SIGNING_SECRET = process.env.LEDGER_SCANNER_SECRET || "";
const CRYPTO = "usdc_arbitrum";

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      crypto: { type: "string", default: CRYPTO },
    },
  });

  const hl = HyperliquidClient.get();
  const crypto = values.crypto || CRYPTO;
  const wallets = `${crypto}:${hl.address}`;

  const res = await fetch(`${SIGNING_API}/onramper-sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallets, secret: SIGNING_SECRET }),
  });

  if (!res.ok) {
    console.log(
      JSON.stringify({
        error: `Signing API error: ${res.status} ${await res.text()}`,
      }),
    );
    process.exit(1);
  }

  const { signature, apiKey } = await res.json();

  const params = new URLSearchParams({
    apikey: apiKey,
    onlyCryptos: crypto,
    themeName: "dark",
    containerColor: "15161b",
    primaryColor: "9a78ff",
    secondaryColor: "34343a",
    cardColor: "1e1e25",
    primaryTextColor: "ffffff",
    secondaryTextColor: "ffffff",
    primaryBtnTextColor: "ffffff",
    borderRadius: "1",
    wgBorderRadius: "1.5",
    mode: "buy",
    wallets,
    defaultCrypto: crypto,
    signature,
  }).toString();

  console.log(
    JSON.stringify({
      status: "ok",
      url: `${ONRAMPER_URL}?${params}`,
      address: hl.address,
      crypto,
    }),
  );
}
