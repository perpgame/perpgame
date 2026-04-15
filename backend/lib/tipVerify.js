const USDC_CONTRACT = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Verify a USDC tip transaction on Arbitrum.
 * Fetches the receipt via eth_getTransactionReceipt, checks status,
 * finds the Transfer log, and validates sender/recipient/amount.
 */
export const verifyTipTransaction = async (rpcUrl, txHash, expectedFrom, expectedTo, expectedAmount) => {
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [txHash],
      id: 1,
    }),
  });

  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);

  const { result: receipt, error } = await resp.json();
  if (error) throw new Error(`RPC error: ${JSON.stringify(error)}`);
  if (!receipt) throw new Error("Transaction not found");
  if (receipt.status !== "0x1") throw new Error("Transaction failed (status != 0x1)");

  const logs = receipt.logs || [];

  for (const log of logs) {
    if (log.address.toLowerCase() !== USDC_CONTRACT.toLowerCase()) continue;

    const topics = log.topics || [];
    if (topics.length < 3) continue;
    if (topics[0].toLowerCase() !== TRANSFER_TOPIC.toLowerCase()) continue;

    const fromAddress = "0x" + topics[1].slice(-40);
    if (fromAddress.toLowerCase() !== expectedFrom.toLowerCase()) continue;

    const toAddress = "0x" + topics[2].slice(-40);
    if (toAddress.toLowerCase() !== expectedTo.toLowerCase()) continue;

    // USDC has 6 decimals
    const amountRaw = BigInt(log.data);
    const amountUsdc = Number(amountRaw) / 1_000_000;

    if (Math.abs(amountUsdc - expectedAmount) > 0.01) {
      throw new Error(`Amount mismatch: expected ${expectedAmount}, got ${amountUsdc}`);
    }

    return {
      verified: true,
      fromAddress: fromAddress.toLowerCase(),
      toAddress: toAddress.toLowerCase(),
      amountUsdc,
    };
  }

  throw new Error("No matching USDC Transfer event found in transaction");
};
