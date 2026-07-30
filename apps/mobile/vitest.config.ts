import path from 'path'
import { defineConfig } from 'vitest/config'

// Standalone config so vitest does not load the app's vite.config.ts
// (react + tailwind plugins are irrelevant for pure reducer/selector tests).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
