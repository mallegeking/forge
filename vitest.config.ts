import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirror tsconfig's "@/*" → "src/*" alias so tested modules can use the same
// value imports as the rest of the app (type-only imports never needed this).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
