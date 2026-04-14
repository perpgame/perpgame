import { loadMeta } from "./meta.js";
import { connectDb } from "./db/index.js";
import { startApi } from "./api.js";
import { startWorkers } from "./lib/workers.js";
import { logError } from "./lib/errorLog.js";
import { initLeaderboard } from "./routes/agentLeaderboard.js";

// Capture console.error into the in-memory error log
const _origError = console.error.bind(console);
console.error = (...args) => {
  _origError(...args);
  const message = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
  const stack = args.find(a => a instanceof Error)?.stack ?? null;
  logError('console', message, stack);
};

// Capture unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : null;
  logError('unhandledRejection', message, stack);
});

await loadMeta();
await connectDb();

startApi();
startWorkers();
initLeaderboard();
