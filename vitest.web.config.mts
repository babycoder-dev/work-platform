import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['modules/**/web/**/*.spec.tsx', 'packages/**/*.spec.tsx', 'apps/**/*.spec.tsx'],
    exclude: ['**/*.e2e-spec.ts', '**/node_modules/**', '**/dist/**'],
    setupFiles: ['./vitest.web.setup.ts'],
  },
});
