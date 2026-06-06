import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 30000,
    include: ['apps/**/*.e2e-spec.ts', 'modules/**/*.e2e-spec.ts'],
    testTimeout: 30000,
  },
});
