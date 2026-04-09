import { argv, exit } from "node:process";
import { run as approveBuilderFee } from "./commands/approve-builder-fee.js";
import { run as balances } from "./commands/balances.js";
import { run as closePosition } from "./commands/close-position.js";
import { run as createWallet } from "./commands/create-wallet.js";
import { run as depositToHl } from "./commands/deposit-to-hl.js";
import { run as importWallet } from "./commands/import-wallet.js";
import { run as onrampUrl } from "./commands/onramp-url.js";
import { run as send } from "./commands/send.js";
import { run as setTpsl } from "./commands/set-tpsl.js";
import { run as signMessage } from "./commands/sign-message.js";
import { run as trade } from "./commands/trade.js";
import { run as withdrawFromHl } from "./commands/withdraw-from-hl.js";

const commands: Record<string, (args: string[]) => Promise<void>> = {
  "approve-builder-fee": approveBuilderFee,
  "balances": balances,
  "close-position": closePosition,
  "create-wallet": createWallet,
  "deposit-to-hl": depositToHl,
  "import-wallet": importWallet,
  "onramp-url": onrampUrl,
  "send": send,
  "set-tpsl": setTpsl,
  "sign-message": signMessage,
  "trade": trade,
  "withdraw-from-hl": withdrawFromHl,
};

const subcommand = argv[2];
const args = argv.slice(3);

if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  console.log(`Usage: perpgame-toolkit <command> [options]\n\nCommands:\n${Object.keys(commands).map((c) => `  ${c}`).join("\n")}`);
  exit(0);
}

const handler = commands[subcommand];
if (!handler) {
  console.log(JSON.stringify({ error: `Unknown command: ${subcommand}` }));
  exit(1);
}

handler(args).catch((err) => {
  console.log(JSON.stringify({ error: err.message }));
  exit(1);
});
