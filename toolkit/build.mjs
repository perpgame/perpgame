import { build } from "esbuild";
import { config } from "dotenv";

config();

await build({
  entryPoints: ["src/cli.ts"],
  outfile: "dist/perpgame-toolkit.mjs",
  bundle: true,
  minify: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: [],
  banner: { js: "#!/usr/bin/env node" },
  define: Object.fromEntries(
    ["LEDGER_SCANNER_SECRET"]
      .filter((key) => process.env[key])
      .map((key) => [`process.env.${key}`, JSON.stringify(process.env[key])])
  ),
});

console.log("Built dist/perpgame-toolkit.mjs");
