import { createPublicClient, http, parseAbi, formatUnits, formatEther } from "viem";
import { arbitrum } from "viem/chains";
import HyperliquidClient from "../hyperliquid.js";

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
const USDC_DECIMALS = 6;

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

export async function run(_args: string[]) {
  const hl = HyperliquidClient.get();
  const address = hl.address as `0x${string}`;

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(),
  });

  const [ethBalance, usdcBalance, hlState] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    hl.getClearinghouseState(),
  ]);

  const crossMarginSummary = hlState.crossMarginSummary || {};
  const positions = (hlState.assetPositions || []).map((p: any) => {
    const pos = p.position || p;
    return {
      coin: pos.coin,
      size: pos.szi,
      entryPx: pos.entryPx,
      unrealizedPnl: pos.unrealizedPnl,
      leverage: pos.leverage,
    };
  }).filter((p: any) => parseFloat(p.size) !== 0);

  console.log(JSON.stringify({
    status: "ok",
    address,
    arbitrum: {
      eth: formatEther(ethBalance),
      usdc: formatUnits(usdcBalance, USDC_DECIMALS),
    },
    hyperliquid: {
      accountValue: crossMarginSummary.accountValue || "0",
      totalMarginUsed: crossMarginSummary.totalMarginUsed || "0",
      withdrawable: crossMarginSummary.totalRawUsd || "0",
      positions,
    },
  }));
}
