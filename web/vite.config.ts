import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Production deploy lives at https://sophie-zhen.github.io/energy-moneysaver/,
// so prod builds need /energy-moneysaver/ as the asset base. Dev keeps root
// for `npm run dev` ergonomics.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/energy-moneysaver/" : "/",
  plugins: [react()],
  test: {
    globals: false,
    environment: "node",
  },
}));
