import { parseArgs } from "node:util";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  parseEther,
  formatUnits,
  formatEther,
} from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadPrivateKey } from "../wallet.js";

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
const USDC_DECIMALS = 6;

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      to: { type: "string" },
      amount: { type: "string" },
      token: { type: "string", default: "usdc" },
    },
  });

  if (!values.to || !values.amount) {
    console.log(JSON.stringify({ error: "Required: --to <address> --amount <amount> [--token usdc|eth]" }));
    process.exit(1);
  }

  const token = values.token!.toLowerCase();
  if (token !== "usdc" && token !== "eth") {
    console.log(JSON.stringify({ error: "Only USDC and ETH are supported on Arbitrum." }));
    process.exit(1);
  }

  const account = privateKeyToAccount(loadPrivateKey() as `0x${string}`);
  const to = values.to! as `0x${string}`;

  const publicClient = createPublicClient({ chain: arbitrum, transport: http() });
  const walletClient = createWalletClient({ account, chain: arbitrum, transport: http() });

  if (token === "eth") {
    const amount = parseEther(values.amount!);
    const balance = await publicClient.getBalance({ address: account.address });

    if (amount > balance) {
      console.log(JSON.stringify({ error: `Insufficient ETH. Have ${formatEther(balance)}, want ${values.amount}` }));
      process.exit(1);
    }

    const hash = await walletClient.sendTransaction({ to, value: amount });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log(JSON.stringify({
      status: "ok",
      token: "ETH",
      amount: values.amount,
      from: account.address,
      to,
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    }));
  } else {
    const amount = parseUnits(values.amount!, USDC_DECIMALS);
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });

    if (amount > balance) {
      console.log(JSON.stringify({ error: `Insufficient USDC. Have ${formatUnits(balance, USDC_DECIMALS)}, want ${values.amount}` }));
      process.exit(1);
    }

    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, amount],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log(JSON.stringify({
      status: "ok",
      token: "USDC",
      amount: values.amount,
      from: account.address,
      to,
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    }));
  }
}
