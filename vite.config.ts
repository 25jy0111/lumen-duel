import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // GitHub project Pages uses a repository subpath; local development stays at /.
  base: command === 'build' || isPreview ? '/lumen-duel/' : './',
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
