import { defineConfig } from 'vitest/config'

// Standalone config so vitest does not load the app's vite.config.ts
// (react + tailwind plugins are irrelevant for pure reducer/selector tests).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
