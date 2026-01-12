import { resolve } from 'path';

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

process.env.BROWSERSLIST_IGNORE_OLD_DATA = '1';

export default defineConfig({
  logLevel: 'error',
  test: {
    globals: true,
    environment: 'jsdom',
    env: {
      AIDER_DESK_WEB_TESTING: 'true',
      BROWSERSLIST_IGNORE_OLD_DATA: '1',
    },
    include: ['src/renderer/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'out'],
    setupFiles: ['./src/renderer/src/__tests__/setup.ts'],
  },
  plugins: [
    react(),
    tsconfigPaths({
      projects: [resolve(__dirname, 'tsconfig.web.json')],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@common': resolve(__dirname, 'src/common'),
    },
  },
});
