import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const pkg = (p: string) => fileURLToPath(new URL(`../../packages/${p}`, import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: {
      "@chainsphere/shared": pkg("shared/src/index.ts"),
      "@chainsphere/crypto": pkg("crypto/src/index.ts"),
      "@chainsphere/messaging": pkg("messaging/src/index.ts"),
      "@chainsphere/ipfs": pkg("ipfs/src/index.ts"),
    },
  },
  server: { port: 5173 },
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 600 },
});
