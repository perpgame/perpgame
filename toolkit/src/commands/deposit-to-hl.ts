import { parseArgs } from "node:util";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
} from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadPrivateKey } from "../wallet.js";

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
const HL_BRIDGE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7" as const;
const USDC_DECIMALS = 6;

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      amount: { type: "string" },
    },
  });

  const account = privateKeyToAccount(loadPrivateKey() as `0x${string}`);

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(),
  });

  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  const balanceHuman = parseFloat(formatUnits(balance, USDC_DECIMALS));

  if (balance === 0n) {
    console.log(
      JSON.stringify({
        error: "No USDC balance on Arbitrum",
        address: account.address,
      }),
    );
    process.exit(1);
  }

  let depositAmount: bigint;

  if (values.amount) {
    const requested = BigInt(Math.round(parseFloat(values.amount) * 10 ** USDC_DECIMALS));
    if (requested > balance) {
      console.log(
        JSON.stringify({
          error: `Insufficient balance. Have ${balanceHuman} USDC, requested ${values.amount}`,
        }),
      );
      process.exit(1);
    }
    depositAmount = requested;
  } else {
    depositAmount = balance;
  }

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "transfer",
    args: [HL_BRIDGE, depositAmount],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(
    JSON.stringify({
      status: "ok",
      address: account.address,
      deposited: formatUnits(depositAmount, USDC_DECIMALS),
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    }),
  );
}
