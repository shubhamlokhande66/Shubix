import { defineConfig } from "vitest/config";

// The edit-brain tests make whole Reels (several takes each, reviewed): 1-3 s alone, 10-20 s on a busy 4-core machine
// or a shared CI runner. 5 s (vitest's default) failed them at random there; a wrong edit still fails on its assertions.
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], globals: true, testTimeout: 60_000 } });
