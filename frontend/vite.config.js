import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const hlBase = env.VITE_HL_TESTNET === "true"
    ? "https://api.hyperliquid-testnet.xyz"
    : "https://api.hyperliquid.xyz";

  const hlProxy = {
    "/hl-api": {
      target: hlBase,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/hl-api/, ""),
    },
    "/hl-ws": {
      target: hlBase.replace("https", "wss"),
      changeOrigin: true,
      ws: true,
      rewrite: (path) => path.replace(/^\/hl-ws/, "/ws"),
    },
  };

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": "http://localhost:3000",
        "/uploads": "http://localhost:3000",
        "/ws": { target: "ws://localhost:3000", ws: true },
        ...hlProxy,
      },
    },
    preview: {
      proxy: {
        "/api": "http://localhost:3000",
        "/uploads": "http://localhost:3000",
        "/ws": { target: "ws://localhost:3000", ws: true },
        ...hlProxy,
      },
    },
  };
});
