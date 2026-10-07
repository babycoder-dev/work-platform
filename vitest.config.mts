import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/*.spec.ts',
      'modules/**/*.spec.ts',
      'apps/**/*.spec.ts',
      // 仓库级工具脚本的规则单测（scripts/lib/*.spec.mjs，node 环境）
      'scripts/**/*.spec.mjs',
    ],
    exclude: ['**/*.e2e-spec.ts', '**/*.spec.tsx', '**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
