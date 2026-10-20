import { defineConfig } from 'evalite/config';

// LLM calls with images can take a while, and OpenRouter rate-limits bursts.
export default defineConfig({
  testTimeout: 420_000,
  maxConcurrency: 4,
});
